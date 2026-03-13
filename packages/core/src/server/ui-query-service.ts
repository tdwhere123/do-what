import path from 'node:path';
import {
  AnyEventSchema,
  ApprovalProbeSchema,
  deriveWorkbenchHealthSnapshot,
  InspectorSnapshotSchema,
  MemoryProbeSchema,
  SettingsSnapshotSchema,
  TimelineEntrySchema,
  TimelinePageSchema,
  WorkbenchSnapshotSchema,
  type AnyEvent,
  type ApprovalProbe,
  type CoreSseCause,
  type InspectorSnapshot,
  type MemoryProbe,
  type ModulesHotState,
  type SettingsSnapshot,
  type TimelineEntry,
  type TimelinePage,
  type WorkbenchModulesSnapshot,
  type WorkbenchRunSummary,
  type WorkbenchSnapshot,
  type WorkbenchWorkspaceSummary,
} from '@do-what/protocol';
import { createReadConnection } from '../db/read-connection.js';
import {
  TABLE_APPROVAL_QUEUE,
  TABLE_EVENT_LOG,
  TABLE_GOVERNANCE_LEASES,
  TABLE_RUNS,
  TABLE_WORKSPACES,
} from '../db/schema.js';
import type { HotStateManager } from '../state/index.js';
import type { SettingsStore } from './settings-store.js';
import { DEFAULT_TEMPLATE_DESCRIPTORS } from './template-descriptors.js';

interface EventRow {
  payload: string;
  revision: number;
}

interface RunRow {
  engine_type: string;
  metadata: string | null;
  run_id: string;
  status: string;
  updated_at: string;
  workspace_id: string;
}

interface RunLastEventRow {
  last_event_at: string | null;
  run_id: string;
}

interface WorkspaceRow {
  name: string;
  root_path: string;
  workspace_id: string;
}

interface ApprovalRow {
  approval_id: string;
  created_at: string;
  resolved_at: string | null;
  run_id: string;
  status: string;
  tool_name: string;
}

interface LeaseRow {
  conflict_conclusions: string;
  expires_at: string;
  issued_at: string;
  lease_id: string;
  status: string;
}

interface MemoryRow {
  claim_gist: string | null;
  cue_id: string;
  dimension: string | null;
  gist: string;
  manifestation_state: string;
  retention_state: string;
  scope: string;
  superseded_by: string | null;
  updated_at: string;
}

type SettingsLease = SettingsSnapshot['lease'];
type EventRecord = Record<string, unknown>;

const ACTIVE_RUN_STATUSES = new Set(['created', 'queued', 'started', 'running', 'waiting_approval']);
const ATTENTION_RUN_STATUSES = new Set([
  'waiting_approval',
  'failed',
  'interrupted',
  'governance_invalid',
]);
const LOCKED_SETTINGS_FIELDS = [
  'engine.connection_mode',
  'engine.health_probe',
  'soul.provider_mode',
  'soul.daily_budget_tokens',
  'policy.default_decision',
  'environment.workspace_root',
] as const;
const MEMORY_EVENT_NAMES = new Set([
  'memory_cue_accepted',
  'memory_cue_rejected',
  'memory_cue_modified',
  'claim_superseded',
  'context_cue_used',
]);

function clampLimit(value: number | undefined): number {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return 50;
  }
  return Math.max(1, Math.min(Math.trunc(value), 100));
}

function parseJsonRecord(value: string | null): Record<string, unknown> {
  if (!value) {
    return {};
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    return typeof parsed === 'object' && parsed !== null
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function parseJsonValue(value: string | null): unknown {
  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

function parseEventRow(row: EventRow): AnyEvent | null {
  try {
    const payload = JSON.parse(row.payload) as unknown;
    const parsed = AnyEventSchema.safeParse(payload);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function readNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.length > 0)
    : [];
}

function eventRecord(event: AnyEvent): EventRecord {
  return event as EventRecord;
}

function readEventName(event: AnyEvent): string | undefined {
  return readString(eventRecord(event).event);
}

function readEventOperation(event: AnyEvent): string | undefined {
  return readString(eventRecord(event).operation);
}

function readEventStatus(event: AnyEvent): string | undefined {
  return readString(eventRecord(event).status);
}

function readEventType(event: AnyEvent): string | undefined {
  return readString(eventRecord(event).type);
}

function readPlanStatus(
  value: unknown,
): InspectorSnapshot['plans'][number]['status'] {
  switch (value) {
    case 'pending':
    case 'active':
    case 'done':
    case 'failed':
      return value;
    default:
      return 'pending';
  }
}

function readCause(value: unknown): CoreSseCause | undefined {
  if (typeof value !== 'object' || value === null) {
    return undefined;
  }

  const ackId = readString((value as Record<string, unknown>).ackId);
  const clientCommandId = readString(
    (value as Record<string, unknown>).clientCommandId,
  );
  if (!ackId && !clientCommandId) {
    return undefined;
  }

  return {
    ackId,
    clientCommandId,
  };
}

function extractEventCause(event: AnyEvent): CoreSseCause | undefined {
  return readCause((event as Record<string, unknown>).causedBy);
}

function summarizePatch(patch: string): string {
  const lines = patch
    .split('\n')
    .filter((line) => line.startsWith('+') || line.startsWith('-'));
  if (lines.length === 0) {
    return 'Patch updated';
  }
  return lines.slice(0, 3).join('\n');
}

function deriveRunTitle(runId: string, metadata: Record<string, unknown>): string {
  const explicitTitle = readString(metadata.title);
  if (explicitTitle) {
    return explicitTitle;
  }

  const templatePrompt = readString(
    (metadata.templateInputs as Record<string, unknown> | undefined)?.prompt,
  );
  if (templatePrompt) {
    return templatePrompt.slice(0, 80);
  }

  const bugReport = readString(
    (metadata.templateInputs as Record<string, unknown> | undefined)?.bug_report,
  );
  if (bugReport) {
    return bugReport.slice(0, 80);
  }

  const researchGoal = readString(
    (metadata.templateInputs as Record<string, unknown> | undefined)?.research_goal,
  );
  if (researchGoal) {
    return researchGoal.slice(0, 80);
  }

  const templateId = readString(metadata.templateId);
  if (templateId) {
    const descriptor = DEFAULT_TEMPLATE_DESCRIPTORS.find(
      (candidate) => candidate.templateId === templateId,
    );
    if (descriptor) {
      return descriptor.title;
    }
  }

  return `Run ${runId}`;
}

function deriveWorkspaceStatus(
  runs: readonly WorkbenchRunSummary[],
): WorkbenchWorkspaceSummary['status'] {
  if (runs.some((run) => ATTENTION_RUN_STATUSES.has(run.status))) {
    return 'attention';
  }
  if (runs.some((run) => ACTIVE_RUN_STATUSES.has(run.status))) {
    return 'running';
  }
  return 'idle';
}

function mapModuleState(
  module: ModulesHotState['core'],
): WorkbenchModulesSnapshot['core'] {
  return {
    kind: module.kind,
    label: module.label,
    meta: module.meta ? { ...module.meta } : undefined,
    moduleId: module.module_id,
    phase: module.phase,
    reason: module.reason,
    status: module.status,
    updatedAt: module.updated_at,
  };
}

function mapModulesSnapshot(
  modules: ModulesHotState,
): WorkbenchModulesSnapshot {
  return {
    core: mapModuleState(modules.core),
    engines: {
      claude: mapModuleState(modules.engines.claude),
      codex: mapModuleState(modules.engines.codex),
    },
    soul: mapModuleState(modules.soul),
  };
}

function mapEventToTimelineEntry(event: AnyEvent): TimelineEntry {
  const record = eventRecord(event);
  const eventType = readEventType(event);
  const eventName = readEventName(event);
  const operation = readEventOperation(event);
  const status = readEventStatus(event);
  const base = {
    causedBy: extractEventCause(event),
    id: `timeline-${event.revision}`,
    runId: event.runId,
    timestamp: event.timestamp,
  };

  if (eventType === 'token_stream') {
    const speaker = readString(record.speaker) ?? 'engine';
    return TimelineEntrySchema.parse({
      ...base,
      body: readString(record.text) ?? '',
      kind: 'message',
      meta: {
        isComplete: record.isComplete === true,
        speaker,
      },
      status: record.isComplete === true ? 'completed' : 'streaming',
      title: speaker === 'user' ? 'You' : 'Engine Output',
    });
  }

  if (eventType === 'plan_node') {
    const title = readString(record.title) ?? 'Plan Node';
    const nodeId = readString(record.nodeId) ?? `plan-${event.revision}`;
    return TimelineEntrySchema.parse({
      ...base,
      body: title,
      kind: 'plan',
      meta: {
        nodeId,
      },
      status: readPlanStatus(record.status),
      title,
    });
  }

  if (eventType === 'diff') {
    const filePath = readString(record.path) ?? '(unknown)';
    return TimelineEntrySchema.parse({
      ...base,
      body: summarizePatch(readString(record.patch) ?? ''),
      kind: 'diff',
      meta: {
        hunks: readNumber(record.hunks) ?? 0,
        path: filePath,
      },
      status: 'modified',
      title: filePath,
    });
  }

  if (operation) {
    const cueDraft =
      typeof record.cueDraft === 'object' && record.cueDraft !== null
        ? (record.cueDraft as Record<string, unknown>)
        : null;
    return TimelineEntrySchema.parse({
      ...base,
      body:
        operation === 'search'
          ? readString(record.query)
          : operation === 'open'
            ? readString(record.pointer)
            : operation === 'propose'
              ? readString(cueDraft?.gist)
              : readString(record.cueId),
      kind: 'memory',
      meta: {
        operation,
      },
      status:
        operation === 'commit'
          ? 'committed'
          : operation === 'propose'
            ? 'pending'
            : 'completed',
      title: `Memory ${operation}`,
    });
  }

  if (eventName === 'run_checkpoint') {
    return TimelineEntrySchema.parse({
      ...base,
      body: readString(record.projectId),
      kind: 'checkpoint',
      meta: {
        checkpointId: readString(record.checkpointId),
        projectId: readString(record.projectId),
      },
      status: 'completed',
      title: 'Checkpoint',
    });
  }

  if (eventName && MEMORY_EVENT_NAMES.has(eventName)) {
    return TimelineEntrySchema.parse({
      ...base,
      body: readString(record.cueId) ?? readString(record.proposalId),
      kind: 'memory',
      meta: {
        event: eventName,
      },
      status:
        eventName === 'memory_cue_rejected'
          ? 'rejected'
          : eventName === 'claim_superseded'
            ? 'superseded'
            : 'completed',
      title: eventName,
    });
  }

  if (eventName) {
    return TimelineEntrySchema.parse({
      ...base,
      body: readString(record.reason),
      kind: eventName === 'gate_passed' || eventName === 'gate_failed' ? 'checkpoint' : 'system',
      meta: {
        event: eventName,
      },
      status:
        eventName === 'gate_failed'
          ? 'failed'
          : eventName === 'run_start_denied'
            ? 'denied'
            : 'completed',
      title: eventName,
    });
  }

  if (readString(record.toolName) || (status && status !== 'created' && status !== 'started')) {
    if (status === 'waiting_approval') {
      return TimelineEntrySchema.parse({
        ...base,
        body: `Approval required for ${readString(record.toolName) ?? 'tool'}`,
        kind: 'approval',
        meta: {
          approvalId: readString(record.approvalId),
          toolName: readString(record.toolName),
        },
        status: 'pending',
        title: 'Approval',
      });
    }

    if (
      status === 'requested'
      || status === 'approved'
      || status === 'denied'
      || status === 'executing'
      || status === 'completed'
      || status === 'failed'
    ) {
      return TimelineEntrySchema.parse({
        ...base,
        body:
          readString(record.output)
          ?? readString(record.error)
          ?? readString(record.reason),
        kind: 'tool_call',
        meta: {
          approvalId: readString(record.approvalId),
          toolName: readString(record.toolName),
        },
        status,
        title: readString(record.toolName) ?? 'Tool',
      });
    }
  }

  return TimelineEntrySchema.parse({
    ...base,
    body: readString(record.reason),
    kind: 'system',
    status: status ?? 'completed',
    title: status ? `Run ${status}` : event.source,
  });
}

function readHistoryType(event: AnyEvent): InspectorSnapshot['history'][number]['type'] | null {
  const eventType = readEventType(event);
  const eventName = readEventName(event);
  if (eventType === 'diff') {
    return 'git';
  }
  if (eventType === 'plan_node') {
    return 'run';
  }
  if (readEventOperation(event) || (eventName && MEMORY_EVENT_NAMES.has(eventName))) {
    return 'memory';
  }
  if (eventName === 'run_checkpoint') {
    return 'checkpoint';
  }
  if (eventName) {
    return 'governance';
  }
  return 'run';
}

function readHistoryLabel(event: AnyEvent): string {
  const record = eventRecord(event);
  const eventType = readEventType(event);
  const eventName = readEventName(event);
  const operation = readEventOperation(event);
  const status = readEventStatus(event);
  if (eventType === 'diff') {
    return `Changed ${readString(record.path) ?? '(unknown)'}`;
  }
  if (eventType === 'plan_node') {
    return readString(record.title) ?? 'Plan Node';
  }
  if (operation) {
    return `Memory ${operation}`;
  }
  if (eventName) {
    return eventName;
  }
  if (status) {
    return `Run ${status}`;
  }
  return event.source;
}

function deriveDriftState(events: readonly AnyEvent[]): string {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    const eventName = readEventName(event);
    const reason = readString(eventRecord(event).reason);
    if (eventName === 'run_serialized') {
      return reason === 'hard_stale_serialize' ? 'hard_stale' : 'soft_stale';
    }
    if (eventName === 'gate_failed' || eventName === 'conflict') {
      return 'soft_stale';
    }
  }
  return 'none';
}

function deriveGateState(events: readonly AnyEvent[]): string {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    const eventName = readEventName(event);
    if (eventName === 'gate_passed') {
      return 'open';
    }
    if (eventName === 'gate_failed' || eventName === 'run_start_denied') {
      return 'blocked';
    }
    if (eventName === 'run_serialized') {
      return 'waiting_reconcile';
    }
  }
  return 'idle';
}

function deriveSlotStatus(row: MemoryRow): MemoryProbe['slotStatus'] {
  if (row.superseded_by) {
    return 'superseded';
  }
  return row.claim_gist ? 'bound' : 'unbound';
}

export class UiQueryService {
  private readonly coreSessionId: string;
  private readonly hotStateManager: HotStateManager;
  private readonly settingsStore: SettingsStore;
  private readonly soulDbPath: string;
  private readonly stateDbPath: string;
  private readonly workspaceRoot: string;

  constructor(options: {
    coreSessionId: string;
    hotStateManager: HotStateManager;
    settingsStore: SettingsStore;
    soulDbPath: string;
    stateDbPath: string;
    workspaceRoot: string;
  }) {
    this.coreSessionId = options.coreSessionId;
    this.hotStateManager = options.hotStateManager;
    this.settingsStore = options.settingsStore;
    this.soulDbPath = options.soulDbPath;
    this.stateDbPath = options.stateDbPath;
    this.workspaceRoot = options.workspaceRoot;
  }

  getApprovalProbe(approvalId: string): ApprovalProbe | null {
    const db = createReadConnection(this.stateDbPath);
    try {
      const row = db
        .prepare(
          `SELECT approval_id, run_id, tool_name, status, created_at, resolved_at
           FROM ${TABLE_APPROVAL_QUEUE}
           WHERE approval_id = ?`,
        )
        .get(approvalId) as ApprovalRow | undefined;
      if (!row) {
        return null;
      }

      return ApprovalProbeSchema.parse({
        approvalId: row.approval_id,
        revision: this.hotStateManager.snapshot().last_event_seq,
        runId: row.run_id,
        status: row.status,
        summary: `${row.tool_name} ${row.status}`,
        toolName: row.tool_name,
        updatedAt: row.resolved_at ?? row.created_at,
      });
    } finally {
      db.close();
    }
  }

  getInspectorSnapshot(runId: string): InspectorSnapshot {
    const revision = this.hotStateManager.snapshot().last_event_seq;
    const db = createReadConnection(this.stateDbPath);
    try {
      const runRow = db
        .prepare(
          `SELECT run_id, workspace_id, engine_type, status, updated_at, metadata
           FROM ${TABLE_RUNS}
           WHERE run_id = ?`,
        )
        .get(runId) as RunRow | undefined;
      const metadata = parseJsonRecord(runRow?.metadata ?? null);
      const eventRows = db
        .prepare(
          `SELECT revision, payload
           FROM ${TABLE_EVENT_LOG}
           WHERE run_id = ?
           ORDER BY revision ASC`,
        )
        .all(runId) as EventRow[];
      const events = eventRows
        .map(parseEventRow)
        .filter((event): event is AnyEvent => event !== null);

      const latestDiffByPath = new Map<
        string,
        InspectorSnapshot['files'][number]
      >();
      const latestPlanById = new Map<
        string,
        InspectorSnapshot['plans'][number]
      >();

      for (const event of events) {
        const record = eventRecord(event);
        if (readEventType(event) === 'diff') {
          const diffPath = readString(record.path);
          if (!diffPath) {
            continue;
          }
          latestDiffByPath.set(diffPath, {
            path: diffPath,
            status: 'modified',
            summary: `${readNumber(record.hunks) ?? 0} hunks changed`,
          });
        }

        if (readEventType(event) === 'plan_node') {
          const nodeId = readString(record.nodeId);
          const title = readString(record.title);
          if (!nodeId || !title) {
            continue;
          }
          latestPlanById.set(nodeId, {
            id: nodeId,
            status: readPlanStatus(record.status),
            summary: title,
          });
        }
      }

      const lease = this.readCurrentLease(db);
      const history = events
        .slice(-25)
        .map((event) => ({
          id: `history-${event.revision}`,
          label: readHistoryLabel(event),
          timestamp: event.timestamp,
          type: readHistoryType(event) ?? 'run',
        }));
      const diffPaths = [...latestDiffByPath.keys()];

      return InspectorSnapshotSchema.parse({
        files: [...latestDiffByPath.values()],
        governance: {
          checkpoints: {
            pending: events
              .filter((event) => readEventName(event) === 'run_checkpoint')
              .slice(-3)
              .map((event) => {
                const record = eventRecord(event);
                return {
                  id: `checkpoint-pending-${event.revision}`,
                  label: readString(record.checkpointId) ?? 'checkpoint',
                };
              }),
            recent: events
              .filter((event) => readEventName(event) === 'run_checkpoint')
              .slice(-3)
              .map((event) => {
                const record = eventRecord(event);
                return {
                  id: `checkpoint-recent-${event.revision}`,
                  label: readString(record.checkpointId) ?? 'checkpoint',
                  timestamp: event.timestamp,
                };
              }),
          },
          driftState: deriveDriftState(events),
          gateState: deriveGateState(events),
          leaseId: lease.leaseId,
          leaseStatus: lease.status,
          nativeSurfaceReport: diffPaths.slice(0, 5),
          softStaleNodes: events
            .filter((event) => readEventName(event) === 'run_serialized')
            .slice(-3)
            .map((event) => {
              const record = eventRecord(event);
              return {
                nodeId: readString(record.surfaceId) ?? event.runId,
                summary: readString(record.reason) ?? readEventName(event) ?? 'run_serialized',
              };
            }),
        },
        history,
        overview: {
          branch: readString(metadata.branchName) ?? readString(metadata.templateId) ?? 'unknown',
          collaboration: readStringArray(metadata.participants).map((participant) => ({
            id: participant,
            role: participant,
            title: participant,
          })),
          diffSummary:
            diffPaths.length === 0
              ? 'No file diffs recorded'
              : `${diffPaths.length} changed file${diffPaths.length === 1 ? '' : 's'}`,
          gitTree: diffPaths,
          runStatus: runRow?.status,
          workspaceId: runRow?.workspace_id,
        },
        plans: [...latestPlanById.values()],
        revision,
        runId,
      });
    } finally {
      db.close();
    }
  }

  getMemoryProbe(memoryId: string): MemoryProbe | null {
    const db = createReadConnection(this.soulDbPath);
    try {
      const row = db
        .prepare(
          `SELECT cue_id, gist, claim_gist, dimension, manifestation_state,
                  retention_state, scope, updated_at, superseded_by
           FROM memory_cues
           WHERE cue_id = ?`,
        )
        .get(memoryId) as MemoryRow | undefined;
      if (!row) {
        return null;
      }

      return MemoryProbeSchema.parse({
        claimSummary: row.claim_gist ?? row.gist,
        dimension: row.dimension,
        manifestationState: row.manifestation_state,
        memoryId: row.cue_id,
        retentionState: row.retention_state,
        revision: this.hotStateManager.snapshot().last_event_seq,
        scope: row.scope,
        slotStatus: deriveSlotStatus(row),
        updatedAt: row.updated_at,
      });
    } finally {
      db.close();
    }
  }

  getSettingsSnapshot(): SettingsSnapshot {
    const revision = this.hotStateManager.snapshot().last_event_seq;
    const db = createReadConnection(this.stateDbPath);
    try {
      return SettingsSnapshotSchema.parse(
        this.settingsStore.snapshot({
          coreSessionId: this.coreSessionId,
          lease: this.readCurrentLease(db),
          revision,
        }),
      );
    } finally {
      db.close();
    }
  }

  getTimelinePage(input: {
    beforeRevision?: number | null;
    limit?: number;
    runId: string;
  }): TimelinePage {
    const limit = clampLimit(input.limit);
    const db = createReadConnection(this.stateDbPath);
    try {
      const queryParams =
        typeof input.beforeRevision === 'number'
          ? [input.runId, input.beforeRevision, limit + 1]
          : [input.runId, limit + 1];
      const rows = db
        .prepare(
          typeof input.beforeRevision === 'number'
            ? `SELECT revision, payload
               FROM ${TABLE_EVENT_LOG}
               WHERE run_id = ? AND revision < ?
               ORDER BY revision DESC
               LIMIT ?`
            : `SELECT revision, payload
               FROM ${TABLE_EVENT_LOG}
               WHERE run_id = ?
               ORDER BY revision DESC
               LIMIT ?`,
        )
        .all(...queryParams) as EventRow[];

      const hasMore = rows.length > limit;
      const pageRows = hasMore ? rows.slice(0, limit) : rows;
      const entries = pageRows
        .map(parseEventRow)
        .filter((event): event is AnyEvent => event !== null)
        .reverse()
        .map(mapEventToTimelineEntry);
      const nextBeforeRevision =
        hasMore && entries.length > 0
          ? pageRows[pageRows.length - 1]?.revision ?? null
          : null;

      return TimelinePageSchema.parse({
        entries,
        hasMore,
        limit,
        nextBeforeRevision,
        revision: this.hotStateManager.snapshot().last_event_seq,
        runId: input.runId,
      });
    } finally {
      db.close();
    }
  }

  getWorkbenchSnapshot(): WorkbenchSnapshot {
    const hotState = this.hotStateManager.snapshot();
    const db = createReadConnection(this.stateDbPath);
    try {
      const runRows = db
        .prepare(
          `SELECT run_id, workspace_id, engine_type, status, updated_at, metadata
           FROM ${TABLE_RUNS}
           ORDER BY updated_at DESC`,
        )
        .all() as RunRow[];
      const lastEventRows = db
        .prepare(
          `SELECT run_id, MAX(timestamp) AS last_event_at
           FROM ${TABLE_EVENT_LOG}
           WHERE run_id IS NOT NULL
           GROUP BY run_id`,
        )
        .all() as RunLastEventRow[];
      const workspaceRows = db
        .prepare(
          `SELECT workspace_id, name, root_path
           FROM ${TABLE_WORKSPACES}
           ORDER BY created_at ASC`,
        )
        .all() as WorkspaceRow[];

      const lastEventAtByRun = new Map(
        lastEventRows.map((row) => [row.run_id, row.last_event_at ?? undefined]),
      );
      const pendingApprovalsByRun = new Map<string, string[]>();
      for (const approval of hotState.pending_approvals.values()) {
        const existing = pendingApprovalsByRun.get(approval.run_id) ?? [];
        pendingApprovalsByRun.set(approval.run_id, [...existing, approval.approval_id]);
      }

      const runs = runRows.map((row) => {
        const metadata = parseJsonRecord(row.metadata);
        return WorkbenchSnapshotSchema.shape.runs.element.parse({
          approvalIds: pendingApprovalsByRun.get(row.run_id) ?? [],
          engine: row.engine_type,
          lastEventAt: lastEventAtByRun.get(row.run_id) ?? row.updated_at,
          runId: row.run_id,
          status: row.status,
          title: deriveRunTitle(row.run_id, metadata),
          workspaceId: row.workspace_id,
        }) as WorkbenchRunSummary;
      });

      const workspaceById = new Map<string, WorkspaceRow>();
      for (const row of workspaceRows) {
        workspaceById.set(row.workspace_id, row);
      }

      const runsByWorkspace = new Map<string, WorkbenchRunSummary[]>();
      for (const run of runs) {
        const workspaceId = run.workspaceId ?? 'workspace-orphaned';
        const existing = runsByWorkspace.get(workspaceId) ?? [];
        runsByWorkspace.set(workspaceId, [...existing, run]);
      }

      const workspaces = workspaceRows.map((workspace) => {
        const workspaceRuns = runsByWorkspace.get(workspace.workspace_id) ?? [];
        const lastEventAt = workspaceRuns
          .map((run) => run.lastEventAt)
          .filter((value): value is string => typeof value === 'string')
          .sort()
          .at(-1);
        return WorkbenchSnapshotSchema.shape.workspaces.element.parse({
          lastEventAt,
          name:
            workspace.name
            || (workspace.root_path
              ? path.basename(workspace.root_path)
              : path.basename(this.workspaceRoot)),
          runIds: workspaceRuns.map((run) => run.runId),
          status: deriveWorkspaceStatus(workspaceRuns),
          workspaceId: workspace.workspace_id,
        }) as WorkbenchWorkspaceSummary;
      });

      for (const [workspaceId, workspaceRuns] of runsByWorkspace.entries()) {
        if (workspaceById.has(workspaceId)) {
          continue;
        }

        const lastEventAt = workspaceRuns
          .map((run) => run.lastEventAt)
          .filter((value): value is string => typeof value === 'string')
          .sort()
          .at(-1);
        workspaces.push(
          WorkbenchSnapshotSchema.shape.workspaces.element.parse({
            lastEventAt,
            name: workspaceId,
            runIds: workspaceRuns.map((run) => run.runId),
            status: deriveWorkspaceStatus(workspaceRuns),
            workspaceId,
          }) as WorkbenchWorkspaceSummary,
        );
      }

      const recentEvents = hotState.recent_events
        .map((event) => AnyEventSchema.safeParse(event))
        .flatMap((result) => (result.success ? [result.data] : []));
      const modules = mapModulesSnapshot(hotState.modules);

      return WorkbenchSnapshotSchema.parse({
        connectionState: 'connected',
        coreSessionId: this.coreSessionId,
        health: deriveWorkbenchHealthSnapshot(modules),
        modules,
        pendingApprovals: [...hotState.pending_approvals.values()]
          .sort((left, right) => left.requested_at.localeCompare(right.requested_at))
          .map((approval) => ({
            approvalId: approval.approval_id,
            createdAt: approval.requested_at,
            runId: approval.run_id,
            summary: `Approval required for ${approval.tool_name}`,
            toolName: approval.tool_name,
          })),
        recentEvents,
        revision: hotState.last_event_seq,
        runs,
        workspaces,
      });
    } finally {
      db.close();
    }
  }

  listTemplates() {
    return DEFAULT_TEMPLATE_DESCRIPTORS;
  }

  private readCurrentLease(db: ReturnType<typeof createReadConnection>): SettingsLease {
    const row = db
      .prepare(
        `SELECT lease_id, status, issued_at, expires_at, conflict_conclusions
         FROM ${TABLE_GOVERNANCE_LEASES}
         ORDER BY issued_at DESC
         LIMIT 1`,
      )
      .get() as LeaseRow | undefined;
    if (!row) {
      return {
        leaseId: null,
        lockedFields: [],
        status: 'none',
      };
    }

    const now = Date.now();
    const expiresAt = Date.parse(row.expires_at);
    const conflictConclusions = parseJsonValue(row.conflict_conclusions);
    const hasConflicts =
      typeof conflictConclusions === 'object'
      && conflictConclusions !== null
      && Array.isArray((conflictConclusions as Record<string, unknown>).conflicts)
        ? ((conflictConclusions as Record<string, unknown>).conflicts as unknown[]).length > 0
        : Array.isArray(conflictConclusions)
          ? conflictConclusions.length > 0
        : false;

    if (hasConflicts) {
      return {
        leaseId: row.lease_id,
        lockedFields: [...LOCKED_SETTINGS_FIELDS],
        status: 'conflicting',
      };
    }

    if (row.status === 'active' && !Number.isNaN(expiresAt) && expiresAt > now) {
      return {
        leaseId: row.lease_id,
        lockedFields: [...LOCKED_SETTINGS_FIELDS],
        status: 'active',
      };
    }

    return {
      leaseId: row.lease_id,
      lockedFields: [],
      status: 'stale',
    };
  }
}
