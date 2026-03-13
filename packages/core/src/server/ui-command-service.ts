import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  AnyEventSchema,
  CoreCommandAckSchema,
  type AnyEvent,
  type ApprovalDecisionRequest,
  type CoreCommandAck,
  type CoreSseCause,
  type CreateRunRequest,
  type CreateWorkspaceRequest,
  type DriftResolutionRequest,
  type IntegrationGateDecisionRequest,
  type MemoryEditRequest,
  type MemoryPinRequest,
  type MemoryProposalReviewRequest,
  type MemorySupersedeRequest,
  type OpenWorkspaceRequest,
  type SettingsPatchRequest,
} from '@do-what/protocol';
import type { SoulToolDispatcher } from '@do-what/soul';
import { createReadConnection } from '../db/read-connection.js';
import { TABLE_APPROVAL_QUEUE, TABLE_RUNS } from '../db/schema.js';
import type { WorkerClient } from '../db/worker-client.js';
import type { EventBus } from '../eventbus/event-bus.js';
import type { ApprovalMachineController } from '../machines/approval-machine.js';
import type { RunRegistry } from '../machines/run-registry.js';
import type { AckTracker, HotStateManager } from '../state/index.js';
import type { SettingsStore } from './settings-store.js';
import { DEFAULT_TEMPLATE_DESCRIPTORS } from './template-descriptors.js';
import type { UiQueryService } from './ui-query-service.js';

interface ApprovalRow {
  approval_id: string;
  run_id: string;
  status: string;
  tool_name: string;
}

interface WorkspaceLookupRow {
  name: string;
  root_path: string;
  workspace_id: string;
}

interface CommandAckState {
  ackId: string;
  causedBy: CoreSseCause;
  entityId: string;
  entityType:
    | 'approval'
    | 'drift'
    | 'event'
    | 'gate'
    | 'memory'
    | 'run'
    | 'settings'
    | 'workspace';
}

const RUN_METADATA_UPSERT_SQL = `
INSERT INTO runs (
  run_id,
  workspace_id,
  agent_id,
  engine_type,
  status,
  created_at,
  updated_at,
  completed_at,
  error,
  metadata
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(run_id) DO UPDATE SET
  metadata = COALESCE(excluded.metadata, metadata)
`;

const WORKSPACE_INSERT_SQL = `
INSERT INTO workspaces (
  workspace_id,
  name,
  root_path,
  engine_type,
  created_at,
  last_opened_at
) VALUES (?, ?, ?, ?, ?, ?)
`;

const WORKSPACE_LAST_OPENED_UPDATE_SQL = `
UPDATE workspaces
SET name = COALESCE(?, name),
    last_opened_at = ?
WHERE workspace_id = ?
`;

export class CoreApiError extends Error {
  readonly code: string;
  readonly details?: Record<string, unknown>;
  readonly status: number;

  constructor(input: {
    code: string;
    details?: Record<string, unknown>;
    message: string;
    status: number;
  }) {
    super(input.message);
    this.code = input.code;
    this.details = input.details;
    this.name = 'CoreApiError';
    this.status = input.status;
  }
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function readEngineType(participants: readonly string[]): string {
  return participants.some((participant) => participant === 'codex') ? 'codex' : 'claude';
}

function deriveRunTitle(input: CreateRunRequest): string {
  const prompt = readString((input.templateInputs as Record<string, unknown>).prompt);
  if (prompt) {
    return prompt.slice(0, 80);
  }

  const bugReport = readString(
    (input.templateInputs as Record<string, unknown>).bug_report,
  );
  if (bugReport) {
    return bugReport.slice(0, 80);
  }

  const researchGoal = readString(
    (input.templateInputs as Record<string, unknown>).research_goal,
  );
  if (researchGoal) {
    return researchGoal.slice(0, 80);
  }

  const descriptor = DEFAULT_TEMPLATE_DESCRIPTORS.find(
    (candidate) => candidate.templateId === input.templateId,
  );
  return descriptor?.title ?? `Run ${input.templateId}`;
}

function normalizeReviewAction(
  mode: MemoryProposalReviewRequest['mode'],
): 'accept' | 'hint_only' | 'reject' {
  return mode;
}

function normalizeWorkspaceRootPath(rootPath: string): string {
  const resolved = path.resolve(rootPath.trim());
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}

function readWorkspaceName(
  resolvedRootPath: string,
  requestedName?: string,
): string {
  const trimmedName = requestedName?.trim();
  if (trimmedName) {
    return trimmedName;
  }

  const derivedName = path.basename(resolvedRootPath);
  return derivedName.length > 0 ? derivedName : resolvedRootPath;
}

export class UiCommandService {
  private readonly ackTracker: AckTracker;
  private readonly approvalMachine: ApprovalMachineController;
  private readonly eventBus: EventBus;
  private readonly hotStateManager: HotStateManager;
  private readonly mcpToolDispatcher: SoulToolDispatcher;
  private readonly queryService: UiQueryService;
  private readonly runRegistry: RunRegistry;
  private readonly settingsStore: SettingsStore;
  private readonly stateDbPath: string;
  private readonly workerClient: WorkerClient;
  private readonly workspaceRoot: string;

  constructor(options: {
    ackTracker: AckTracker;
    approvalMachine: ApprovalMachineController;
    eventBus: EventBus;
    hotStateManager: HotStateManager;
    mcpToolDispatcher: SoulToolDispatcher;
    queryService: UiQueryService;
    runRegistry: RunRegistry;
    settingsStore: SettingsStore;
    stateDbPath: string;
    workerClient: WorkerClient;
    workspaceRoot: string;
  }) {
    this.ackTracker = options.ackTracker;
    this.approvalMachine = options.approvalMachine;
    this.eventBus = options.eventBus;
    this.hotStateManager = options.hotStateManager;
    this.mcpToolDispatcher = options.mcpToolDispatcher;
    this.queryService = options.queryService;
    this.runRegistry = options.runRegistry;
    this.settingsStore = options.settingsStore;
    this.stateDbPath = options.stateDbPath;
    this.workerClient = options.workerClient;
    this.workspaceRoot = options.workspaceRoot;
  }

  async createRun(input: CreateRunRequest): Promise<CoreCommandAck> {
    if (!DEFAULT_TEMPLATE_DESCRIPTORS.some((template) => template.templateId === input.templateId)) {
      throw new CoreApiError({
        code: 'template_not_found',
        details: {
          templateId: input.templateId,
        },
        message: `Unknown template: ${input.templateId}`,
        status: 404,
      });
    }

    if (!this.workspaceExists(input.workspaceId)) {
      throw new CoreApiError({
        code: 'workspace_not_found',
        details: {
          workspaceId: input.workspaceId,
        },
        message: `Unknown workspace: ${input.workspaceId}`,
        status: 404,
      });
    }

    const runId = `run-${randomUUID()}`;
    const ack = this.createAck({
      clientCommandId: input.clientCommandId,
      entityId: runId,
      entityType: 'run',
    });
    const now = new Date().toISOString();
    const engineType = readEngineType(input.participants);

    try {
      await this.workerClient.write({
        params: [
          runId,
          input.workspaceId,
          null,
          engineType,
          'created',
          now,
          now,
          null,
          null,
          JSON.stringify({
            participants: input.participants,
            templateId: input.templateId,
            templateInputs: input.templateInputs,
            templateVersion: input.templateVersion,
            title: deriveRunTitle(input),
          }),
        ],
        sql: RUN_METADATA_UPSERT_SQL,
      });

      const actor = this.runRegistry.create({
        engineType,
        runId,
        workspaceId: input.workspaceId,
      });
      actor.send({
        causedBy: ack.causedBy,
        type: 'START',
      });

      return this.commitAck(ack);
    } catch (error) {
      return this.failAck(
        ack,
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  async createWorkspace(input: CreateWorkspaceRequest): Promise<CoreCommandAck> {
    const workspaceId = `workspace-${randomUUID()}`;
    const ack = this.createAck({
      clientCommandId: input.clientCommandId,
      entityId: workspaceId,
      entityType: 'workspace',
    });
    const now = new Date().toISOString();
    const name = input.name.trim();

    try {
      await this.workerClient.write({
        params: [
          workspaceId,
          name,
          this.workspaceRoot,
          null,
          now,
          now,
        ],
        sql: WORKSPACE_INSERT_SQL,
      });
      return this.commitAck(ack);
    } catch (error) {
      return this.failAck(
        ack,
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  async openWorkspace(input: OpenWorkspaceRequest): Promise<CoreCommandAck> {
    const resolvedRootPath = this.resolveWorkspaceDirectory(input.rootPath);
    const existingWorkspace = this.findWorkspaceByRootPath(resolvedRootPath);
    const workspaceId = existingWorkspace?.workspace_id ?? `workspace-${randomUUID()}`;
    const ack = this.createAck({
      clientCommandId: input.clientCommandId,
      entityId: workspaceId,
      entityType: 'workspace',
    });
    const now = new Date().toISOString();

    try {
      if (existingWorkspace) {
        await this.workerClient.write({
          params: [input.name?.trim() || null, now, existingWorkspace.workspace_id],
          sql: WORKSPACE_LAST_OPENED_UPDATE_SQL,
        });
        return this.commitAck(ack);
      }

      await this.workerClient.write({
        params: [
          workspaceId,
          readWorkspaceName(resolvedRootPath, input.name),
          resolvedRootPath,
          null,
          now,
          now,
        ],
        sql: WORKSPACE_INSERT_SQL,
      });
      return this.commitAck(ack);
    } catch (error) {
      return this.failAck(ack, error instanceof Error ? error.message : String(error));
    }
  }

  decideApproval(
    approvalId: string,
    input: ApprovalDecisionRequest,
  ): CoreCommandAck {
    const approval = this.readApproval(approvalId);
    if (!approval) {
      throw new CoreApiError({
        code: 'approval_not_found',
        message: `Unknown approval: ${approvalId}`,
        status: 404,
      });
    }
    if (approval.status !== 'pending') {
      throw new CoreApiError({
        code: 'approval_not_pending',
        details: {
          approvalId,
          status: approval.status,
        },
        message: `Approval ${approvalId} is already ${approval.status}`,
        status: 409,
      });
    }

    const ack = this.createAck({
      clientCommandId: input.clientCommandId,
      entityId: approvalId,
      entityType: 'approval',
    });
    const now = new Date().toISOString();

    if (input.decision === 'reject') {
      this.approvalMachine.deny(approvalId, 'rejected by user');
      this.runRegistry.send(approval.run_id, {
        approvalId,
        approved: false,
        causedBy: ack.causedBy,
        reason: 'rejected by user',
        type: 'TOOL_RESOLVED',
      });
      const published = this.eventBus.publish({
        approvalId,
        causedBy: ack.causedBy,
        decision: input.decision,
        reason: 'rejected by user',
        runId: approval.run_id,
        source: 'core.approval',
        status: 'denied',
        timestamp: now,
        toolName: approval.tool_name,
      });
      return this.commitAck(ack, published.revision);
    }

    this.approvalMachine.approve(approvalId, 'user');
    this.runRegistry.send(approval.run_id, {
      approvalId,
      approved: true,
      causedBy: ack.causedBy,
      type: 'TOOL_RESOLVED',
    });
    const published = this.eventBus.publish({
      approvalId,
      approvedBy: 'user',
      causedBy: ack.causedBy,
      decision: input.decision,
      runId: approval.run_id,
      source: 'core.approval',
      status: 'approved',
      timestamp: now,
      toolName: approval.tool_name,
    });
    return this.commitAck(ack, published.revision);
  }

  async patchSettings(input: SettingsPatchRequest): Promise<CoreCommandAck> {
    const settings = this.queryService.getSettingsSnapshot();
    const lockedFields = new Set(settings.lease.lockedFields);
    const touchedFields = Object.keys(input.fields);
    const blockedFields = touchedFields.filter((field) => lockedFields.has(field));
    if (blockedFields.length > 0) {
      throw new CoreApiError({
        code: 'settings_locked_by_lease',
        details: {
          blockedFields,
          leaseId: settings.lease.leaseId,
        },
        message: 'One or more settings fields are locked by an active governance lease.',
        status: 409,
      });
    }

    const ack = this.createAck({
      clientCommandId: input.clientCommandId,
      entityId: 'settings-root',
      entityType: 'settings',
    });
    const revision = this.hotStateManager.snapshot().last_event_seq;
    this.settingsStore.updateFields(input.fields, revision);
    return this.commitAck(ack, revision);
  }

  async reviewMemoryProposal(
    proposalId: string,
    input: MemoryProposalReviewRequest,
  ): Promise<CoreCommandAck> {
    const ack = this.createAck({
      clientCommandId: input.clientCommandId,
      entityId: proposalId,
      entityType: 'memory',
    });
    const detach = this.linkAckToMatchingEvents(ack.ackId, (event) => {
      const proposalMatch =
        'proposalId' in event && readString((event as Record<string, unknown>).proposalId) === proposalId;
      const cueDraftMatch =
        'operation' in event
        && event.operation === 'commit'
        && readString((event as Record<string, unknown>).proposalId) === proposalId;
      return proposalMatch || cueDraftMatch;
    });

    try {
      await this.mcpToolDispatcher.dispatch({
        arguments: {
          action: normalizeReviewAction(input.mode),
          edits: input.edits,
          proposal_id: proposalId,
        },
        name: 'soul.review_memory_proposal',
      });
      return this.commitAck(ack);
    } catch (error) {
      return this.failAck(
        ack,
        error instanceof Error ? error.message : String(error),
      );
    } finally {
      detach();
    }
  }

  postRunMessage(runId: string, body: string, clientCommandId: string): CoreCommandAck {
    if (!this.runExists(runId)) {
      throw new CoreApiError({
        code: 'run_not_found',
        message: `Unknown run: ${runId}`,
        status: 404,
      });
    }

    const ack = this.createAck({
      clientCommandId,
      entityId: runId,
      entityType: 'event',
    });
    const published = this.eventBus.publish({
      causedBy: ack.causedBy,
      isComplete: true,
      runId,
      source: 'core.message',
      speaker: 'user',
      text: body,
      timestamp: new Date().toISOString(),
      type: 'token_stream',
    });
    return this.commitAck(ack, published.revision);
  }

  rejectUnsupportedDriftAction(
    nodeId: string,
    input: DriftResolutionRequest,
  ): CoreCommandAck {
    return this.createImmediateFailureAck({
      clientCommandId: input.clientCommandId,
      entityId: nodeId,
      entityType: 'drift',
      message: 'Drift resolution commands are not wired to a mutable Core path yet.',
    });
  }

  rejectUnsupportedGateAction(
    runId: string,
    input: IntegrationGateDecisionRequest,
  ): CoreCommandAck {
    return this.createImmediateFailureAck({
      clientCommandId: input.clientCommandId,
      entityId: input.gateId ?? runId,
      entityType: 'gate',
      message: 'Integration gate decisions are not wired to a mutable Core path yet.',
    });
  }

  rejectUnsupportedMemoryEdit(
    memoryId: string,
    input: MemoryEditRequest,
  ): CoreCommandAck {
    return this.createImmediateFailureAck({
      clientCommandId: input.clientCommandId,
      entityId: memoryId,
      entityType: 'memory',
      message: 'Memory edit commands are not wired to a mutable Soul path yet.',
    });
  }

  rejectUnsupportedMemoryPin(
    memoryId: string,
    input: MemoryPinRequest,
  ): CoreCommandAck {
    return this.createImmediateFailureAck({
      clientCommandId: input.clientCommandId,
      entityId: memoryId,
      entityType: 'memory',
      message: 'Memory pin commands are not wired to a mutable Soul path yet.',
    });
  }

  rejectUnsupportedMemorySupersede(
    memoryId: string,
    input: MemorySupersedeRequest,
  ): CoreCommandAck {
    return this.createImmediateFailureAck({
      clientCommandId: input.clientCommandId,
      entityId: memoryId,
      entityType: 'memory',
      message: 'Memory supersede commands are not wired to a mutable Soul path yet.',
    });
  }

  private commitAck(ack: CommandAckState, revision?: number): CoreCommandAck {
    if (typeof revision === 'number') {
      this.ackTracker.setRevision(ack.ackId, revision);
    }
    const trackedAck =
      this.ackTracker.markCommitted(ack.ackId) ?? this.ackTracker.get(ack.ackId);
    return CoreCommandAckSchema.parse({
      ackId: ack.ackId,
      entityId: ack.entityId,
      entityType: ack.entityType,
      ok: true,
      revision: trackedAck?.revision,
    });
  }

  private createAck(input: {
    clientCommandId: string;
    entityId: string;
    entityType:
      | 'approval'
      | 'drift'
      | 'event'
      | 'gate'
      | 'memory'
      | 'run'
      | 'settings'
      | 'workspace';
  }): CommandAckState {
    const ack = this.ackTracker.createPending({
      causedBy: {
        clientCommandId: input.clientCommandId,
      },
      entity_id: input.entityId,
      entity_type: input.entityType,
      revision: this.hotStateManager.snapshot().last_event_seq,
    });
    return {
      ackId: ack.ack_id,
      causedBy: {
        ackId: ack.ack_id,
        clientCommandId: input.clientCommandId,
      },
      entityId: input.entityId,
      entityType: input.entityType,
    };
  }

  private createImmediateFailureAck(input: {
    clientCommandId: string;
    entityId: string;
    entityType: 'drift' | 'gate' | 'memory';
    message: string;
  }): CoreCommandAck {
    const ack = this.createAck(input);
    return this.failAck(ack, input.message);
  }

  private failAck(ack: CommandAckState, error: string): CoreCommandAck {
    const trackedAck =
      this.ackTracker.markFailed(ack.ackId, error) ?? this.ackTracker.get(ack.ackId);
    return CoreCommandAckSchema.parse({
      ackId: ack.ackId,
      entityId: ack.entityId,
      entityType: ack.entityType,
      ok: true,
      revision: trackedAck?.revision,
    });
  }

  private linkAckToMatchingEvents(
    ackId: string,
    predicate: (event: AnyEvent) => boolean,
  ): () => void {
    const listener = (event: { revision: number } & Record<string, unknown>) => {
      const parsed = AnyEventSchema.safeParse(event);
      if (!parsed.success || !predicate(parsed.data)) {
        return;
      }
      this.ackTracker.setRevision(ackId, parsed.data.revision);
    };
    this.eventBus.onAny(listener);
    return () => {
      this.eventBus.offAny(listener);
    };
  }

  private readApproval(approvalId: string): ApprovalRow | null {
    const db = createReadConnection(this.stateDbPath);
    try {
      const row = db
        .prepare(
          `SELECT approval_id, run_id, tool_name, status
           FROM ${TABLE_APPROVAL_QUEUE}
           WHERE approval_id = ?`,
        )
        .get(approvalId) as ApprovalRow | undefined;
      return row ?? null;
    } finally {
      db.close();
    }
  }

  private runExists(runId: string): boolean {
    const db = createReadConnection(this.stateDbPath);
    try {
      const row = db
        .prepare(
          `SELECT run_id
           FROM ${TABLE_RUNS}
           WHERE run_id = ?`,
        )
        .get(runId) as { run_id: string } | undefined;
      return Boolean(row);
    } finally {
      db.close();
    }
  }

  private workspaceExists(workspaceId: string): boolean {
    const db = createReadConnection(this.stateDbPath);
    try {
      const row = db
        .prepare(
          `SELECT workspace_id
           FROM workspaces
           WHERE workspace_id = ?`,
        )
        .get(workspaceId) as WorkspaceLookupRow | undefined;
      return Boolean(row);
    } finally {
      db.close();
    }
  }

  private findWorkspaceByRootPath(rootPath: string): WorkspaceLookupRow | null {
    const normalizedRootPath = normalizeWorkspaceRootPath(rootPath);
    const db = createReadConnection(this.stateDbPath);
    try {
      const rows = db
        .prepare(
          `SELECT workspace_id, name, root_path
           FROM workspaces`,
        )
        .all() as WorkspaceLookupRow[];
      return (
        rows.find(
          (row) => normalizeWorkspaceRootPath(row.root_path) === normalizedRootPath,
        ) ?? null
      );
    } finally {
      db.close();
    }
  }

  private resolveWorkspaceDirectory(rootPath: string): string {
    const trimmedPath = rootPath.trim();
    if (trimmedPath.length === 0) {
      throw new CoreApiError({
        code: 'workspace_path_required',
        message: 'Workspace root path is required.',
        status: 400,
      });
    }

    const resolvedRootPath = path.resolve(trimmedPath);
    let stats: fs.Stats;
    try {
      stats = fs.statSync(resolvedRootPath);
    } catch {
      throw new CoreApiError({
        code: 'workspace_path_not_found',
        details: {
          rootPath: resolvedRootPath,
        },
        message: `Workspace path does not exist: ${resolvedRootPath}`,
        status: 404,
      });
    }

    if (!stats.isDirectory()) {
      throw new CoreApiError({
        code: 'workspace_path_not_directory',
        details: {
          rootPath: resolvedRootPath,
        },
        message: `Workspace path is not a directory: ${resolvedRootPath}`,
        status: 400,
      });
    }

    return resolvedRootPath;
  }
}
