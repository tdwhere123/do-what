import type Database from 'better-sqlite3';
import {
  BaseEventSchema,
  type ApprovalHotState,
  type BaseEvent,
  type CheckpointHotState,
  type CoreHotState,
  type EngineHotState,
  type ModuleHotState,
  type ModulesHotState,
  type RunHotState,
} from '@do-what/protocol';
import { createReadConnection } from '../db/read-connection.js';
import { TABLE_APPROVAL_QUEUE, TABLE_EVENT_LOG, TABLE_RUNS } from '../db/schema.js';

const DEFAULT_MAX_RECENT_EVENTS = 20;
const RUN_EVENT_SOURCES = new Set([
  'core.governance',
  'core.rehydrate',
  'core.run-machine',
  'core.run-registry',
]);

interface EventLogBootstrapRow {
  payload: string;
  revision: number;
  source: string;
  timestamp: string;
}

interface RunBootstrapRow {
  agent_id: string | null;
  created_at: string;
  engine_type: string;
  error: string | null;
  run_id: string;
  status: string;
  updated_at: string;
  workspace_id: string;
}

interface ApprovalBootstrapRow {
  approval_id: string;
  created_at: string;
  resolver: string | null;
  resolved_at: string | null;
  run_id: string;
  status: string;
  tool_name: string;
}

interface InternalCoreHotState {
  active_checkpoints: Map<string, CheckpointHotState>;
  engines: Map<string, EngineHotState>;
  last_event_seq: number;
  modules: ModulesHotState;
  pending_approvals: Map<string, ApprovalHotState>;
  recent_events: readonly BaseEvent[];
  runs: Map<string, RunHotState>;
}

export interface HotStateManagerOptions {
  dbPath: string;
  maxRecentEvents?: number;
}

export interface RunStatusChange {
  agent_id?: string;
  engine_type?: string;
  run_id: string;
  status: RunHotState['status'];
  updated_at: string;
  workspace_id?: string;
}

export interface ApprovalResolutionChange {
  approval_id: string;
  approved: boolean;
  resolved_at: string;
  resolver: 'policy' | 'user' | 'timeout';
  status: 'approved' | 'denied' | 'timeout';
}

function createEmptyState(): InternalCoreHotState {
  return {
    active_checkpoints: new Map(),
    engines: new Map(),
    last_event_seq: 0,
    modules: createEmptyModules(),
    pending_approvals: new Map(),
    recent_events: [],
    runs: new Map(),
  };
}

function createModuleState(input: {
  readonly kind: ModuleHotState['kind'];
  readonly label: string;
  readonly meta?: Readonly<Record<string, unknown>>;
  readonly moduleId: string;
  readonly phase: ModuleHotState['phase'];
  readonly reason?: string;
  readonly status: ModuleHotState['status'];
  readonly updatedAt: string;
}): ModuleHotState {
  return {
    kind: input.kind,
    label: input.label,
    meta: input.meta,
    module_id: input.moduleId,
    phase: input.phase,
    reason: input.reason,
    status: input.status,
    updated_at: input.updatedAt,
  };
}

function createEmptyModules(
  updatedAt = new Date(0).toISOString(),
): ModulesHotState {
  return {
    core: createModuleState({
      kind: 'core',
      label: 'Core',
      moduleId: 'core',
      phase: 'probing',
      status: 'disconnected',
      updatedAt,
    }),
    engines: {
      claude: createModuleState({
        kind: 'engine',
        label: 'Claude',
        moduleId: 'claude',
        phase: 'probing',
        status: 'disconnected',
        updatedAt,
      }),
      codex: createModuleState({
        kind: 'engine',
        label: 'Codex',
        moduleId: 'codex',
        phase: 'probing',
        status: 'disconnected',
        updatedAt,
      }),
    },
    soul: createModuleState({
      kind: 'soul',
      label: 'Soul',
      moduleId: 'soul',
      phase: 'probing',
      status: 'disconnected',
      updatedAt,
    }),
  };
}

function cloneModule(module: ModuleHotState): ModuleHotState {
  return {
    ...module,
    meta: module.meta ? { ...module.meta } : undefined,
  };
}

function cloneMapValues<T extends object>(input: ReadonlyMap<string, T>): Map<string, T> {
  const cloned = new Map<string, T>();
  for (const [key, value] of input.entries()) {
    cloned.set(key, { ...value });
  }
  return cloned;
}

function cloneState(state: InternalCoreHotState): InternalCoreHotState {
  return {
    active_checkpoints: cloneMapValues(state.active_checkpoints),
    engines: cloneMapValues(state.engines),
    last_event_seq: state.last_event_seq,
    modules: {
      core: cloneModule(state.modules.core),
      engines: {
        claude: cloneModule(state.modules.engines.claude),
        codex: cloneModule(state.modules.engines.codex),
      },
      soul: cloneModule(state.modules.soul),
    },
    pending_approvals: cloneMapValues(state.pending_approvals),
    recent_events: state.recent_events.map((event) => ({ ...event })),
    runs: cloneMapValues(state.runs),
  };
}

function toRunHotStatus(value: string): RunHotState['status'] | null {
  switch (value) {
    case 'cancelled':
    case 'completed':
    case 'created':
    case 'failed':
    case 'interrupted':
    case 'governance_invalid':
    case 'running':
    case 'started':
    case 'waiting_approval':
      return value;
    default:
      return null;
  }
}

function isToolLikeEvent(event: BaseEvent & Record<string, unknown>): boolean {
  return (
    typeof event.toolName === 'string'
    || typeof event.args === 'object'
    || typeof event.output === 'string'
    || typeof event.exitCode === 'number'
    || typeof event.pid === 'number'
    || typeof event.approvedBy === 'string'
  );
}

function isRunLifecycleEvent(event: BaseEvent): boolean {
  const candidate = event as BaseEvent & Record<string, unknown>;
  const status = typeof candidate.status === 'string' ? candidate.status : null;
  if (!status) {
    return false;
  }

  if (
    status === 'started'
    || status === 'waiting_approval'
    || status === 'cancelled'
    || status === 'interrupted'
    || status === 'governance_invalid'
  ) {
    return true;
  }

  if (status === 'created') {
    return (
      typeof candidate.workspaceId === 'string'
      || typeof candidate.engineType === 'string'
      || typeof candidate.agentId === 'string'
    );
  }

  if (status === 'completed' || status === 'failed') {
    return RUN_EVENT_SOURCES.has(event.source) && !isToolLikeEvent(candidate);
  }

  return false;
}

function appendRecentEvent(
  events: readonly BaseEvent[],
  nextEvent: BaseEvent,
  maxRecentEvents: number,
): readonly BaseEvent[] {
  const appended = [...events, { ...nextEvent }];
  if (appended.length <= maxRecentEvents) {
    return appended;
  }
  return appended.slice(appended.length - maxRecentEvents);
}

function upsertRunFromEvent(
  state: InternalCoreHotState,
  event: BaseEvent,
): void {
  if (!isRunLifecycleEvent(event)) {
    return;
  }

  const candidate = event as BaseEvent & Record<string, unknown>;
  const nextStatus = toRunHotStatus(String(candidate.status));
  if (!nextStatus) {
    return;
  }

  const existing = state.runs.get(event.runId);
  const nextRun: RunHotState = {
    active_approval_id:
      nextStatus === 'waiting_approval' && typeof candidate.approvalId === 'string'
        ? candidate.approvalId
        : undefined,
    active_tool_name:
      nextStatus === 'waiting_approval' && typeof candidate.toolName === 'string'
        ? candidate.toolName
        : undefined,
    agent_id:
      typeof candidate.agentId === 'string'
        ? candidate.agentId
        : existing?.agent_id,
    engine_type:
      typeof candidate.engineType === 'string'
        ? candidate.engineType
        : existing?.engine_type,
    error:
      typeof candidate.error === 'string'
        ? candidate.error
        : nextStatus === 'failed'
          ? existing?.error
          : undefined,
    run_id: event.runId,
    started_at: existing?.started_at ?? (nextStatus === 'created' || nextStatus === 'started'
      ? event.timestamp
      : undefined),
    status: nextStatus,
    updated_at: event.timestamp,
    workspace_id:
      typeof candidate.workspaceId === 'string'
        ? candidate.workspaceId
        : existing?.workspace_id,
  };
  state.runs.set(event.runId, nextRun);

  if (nextStatus !== 'waiting_approval') {
    clearPendingApprovalsForRun(state, event.runId);
  }
  if (
    nextStatus === 'completed'
    || nextStatus === 'failed'
    || nextStatus === 'cancelled'
    || nextStatus === 'interrupted'
    || nextStatus === 'governance_invalid'
  ) {
    clearCheckpointsForRun(state, event.runId);
  }
}

function upsertApprovalFromEvent(
  state: InternalCoreHotState,
  event: BaseEvent,
): void {
  const candidate = event as BaseEvent & Record<string, unknown>;
  if (candidate.status !== 'waiting_approval') {
    return;
  }
  if (typeof candidate.approvalId !== 'string' || typeof candidate.toolName !== 'string') {
    return;
  }

  const approval: ApprovalHotState = {
    approval_id: candidate.approvalId,
    requested_at: event.timestamp,
    run_id: event.runId,
    status: 'pending',
    tool_name: candidate.toolName,
  };
  state.pending_approvals.set(approval.approval_id, approval);
}

function upsertEngineFromEvent(
  state: InternalCoreHotState,
  event: BaseEvent,
): void {
  const candidate = event as BaseEvent & Record<string, unknown>;
  if (candidate.event !== 'engine_connect' && candidate.event !== 'engine_disconnect' && candidate.event !== 'circuit_break') {
    return;
  }
  if (candidate.engineType !== 'claude' && candidate.engineType !== 'codex') {
    return;
  }

  const existing = state.engines.get(candidate.engineType);
  const nextStatus: EngineHotState['status'] =
    candidate.event === 'engine_connect'
      ? 'connected'
      : candidate.event === 'circuit_break'
        ? 'circuit_open'
        : 'disconnected';

  state.engines.set(candidate.engineType, {
    current_run_id: existing?.current_run_id,
    engine_id: candidate.engineType,
    kind: candidate.engineType,
    reason: typeof candidate.reason === 'string' ? candidate.reason : undefined,
    status: nextStatus,
    updated_at: event.timestamp,
    version: typeof candidate.version === 'string' ? candidate.version : existing?.version,
  });
}

function upsertCheckpointFromEvent(
  state: InternalCoreHotState,
  event: BaseEvent,
): void {
  const candidate = event as BaseEvent & Record<string, unknown>;
  if (candidate.event !== 'run_checkpoint') {
    return;
  }

  const checkpointId =
    typeof candidate.checkpointId === 'string' && candidate.checkpointId.length > 0
      ? candidate.checkpointId
      : `${event.runId}:${event.revision}`;
  state.active_checkpoints.set(checkpointId, {
    active: true,
    checkpoint_id: checkpointId,
    project_id: typeof candidate.projectId === 'string' ? candidate.projectId : undefined,
    run_id: event.runId,
    triggered_at: event.timestamp,
  });
}

function clearCheckpointsForRun(state: InternalCoreHotState, runId: string): void {
  for (const [checkpointId, checkpoint] of state.active_checkpoints.entries()) {
    if (checkpoint.run_id === runId) {
      state.active_checkpoints.delete(checkpointId);
    }
  }
}

function clearPendingApprovalsForRun(state: InternalCoreHotState, runId: string): void {
  for (const [approvalId, approval] of state.pending_approvals.entries()) {
    if (approval.run_id === runId) {
      state.pending_approvals.delete(approvalId);
    }
  }
}

function updateSoulModuleState(
  state: InternalCoreHotState,
  event: BaseEvent,
  candidate: BaseEvent & Record<string, unknown>,
): void {
  if (candidate.event !== 'soul_mode') {
    return;
  }

  state.modules = {
    ...state.modules,
    soul: createModuleState({
      kind: 'soul',
      label: 'Soul',
      meta: {
        provider: typeof candidate.provider === 'string' ? candidate.provider : undefined,
        soulMode: typeof candidate.soul_mode === 'string' ? candidate.soul_mode : undefined,
      },
      moduleId: 'soul',
      phase: 'ready',
      reason: typeof candidate.reason === 'string' ? candidate.reason : undefined,
      status: 'connected',
      updatedAt: event.timestamp,
    }),
  };
}

function replaceEngineModule(
  state: InternalCoreHotState,
  engineType: 'claude' | 'codex',
  module: ModuleHotState,
): void {
  state.modules = {
    ...state.modules,
    engines: {
      ...state.modules.engines,
      [engineType]: module,
    },
  };
}

function updateEngineModuleState(
  state: InternalCoreHotState,
  event: BaseEvent,
  candidate: BaseEvent & Record<string, unknown>,
): void {
  if (candidate.engineType !== 'claude' && candidate.engineType !== 'codex') {
    return;
  }

  const existing = state.modules.engines[candidate.engineType];
  if (candidate.event === 'engine_connect') {
    replaceEngineModule(
      state,
      candidate.engineType,
      createModuleState({
        kind: 'engine',
        label: existing.label,
        meta: {
          version: typeof candidate.version === 'string' ? candidate.version : undefined,
        },
        moduleId: candidate.engineType,
        phase: 'ready',
        status: 'connected',
        updatedAt: event.timestamp,
      }),
    );
    return;
  }

  if (candidate.event === 'engine_disconnect') {
    replaceEngineModule(
      state,
      candidate.engineType,
      createModuleState({
        kind: 'engine',
        label: existing.label,
        meta: existing.meta,
        moduleId: candidate.engineType,
        phase: 'degraded',
        reason: typeof candidate.reason === 'string' ? candidate.reason : undefined,
        status: 'disconnected',
        updatedAt: event.timestamp,
      }),
    );
    return;
  }

  if (candidate.event !== 'circuit_break') {
    return;
  }

  replaceEngineModule(
    state,
    candidate.engineType,
    createModuleState({
      kind: 'engine',
      label: existing.label,
      meta: {
        ...existing.meta,
        failureCount:
          typeof candidate.failureCount === 'number' ? candidate.failureCount : undefined,
      },
      moduleId: candidate.engineType,
      phase: 'degraded',
      reason: 'circuit breaker open',
      status: 'connected',
      updatedAt: event.timestamp,
    }),
  );
}

function updateModulesFromEvent(
  state: InternalCoreHotState,
  event: BaseEvent,
): void {
  const candidate = event as BaseEvent & Record<string, unknown>;
  updateSoulModuleState(state, event, candidate);
  updateEngineModuleState(state, event, candidate);
}

function parseEventPayload(
  row: EventLogBootstrapRow,
): BaseEvent | null {
  try {
    const parsed = JSON.parse(row.payload) as unknown;
    const result = BaseEventSchema.safeParse(parsed);
    return result.success ? result.data : null;
  } catch (error) {
    console.warn('[core][hot-state] failed to parse event_log payload during bootstrap', error);
    return null;
  }
}

export class HotStateManager {
  private readonly dbPath: string;
  private readonly maxRecentEvents: number;
  private state: InternalCoreHotState;

  constructor(options: HotStateManagerOptions) {
    this.dbPath = options.dbPath;
    this.maxRecentEvents = options.maxRecentEvents ?? DEFAULT_MAX_RECENT_EVENTS;
    this.state = createEmptyState();
  }

  apply(event: BaseEvent): void {
    const nextState = cloneState(this.state);
    nextState.last_event_seq = Math.max(nextState.last_event_seq, event.revision);
    nextState.recent_events = appendRecentEvent(nextState.recent_events, event, this.maxRecentEvents);
    upsertRunFromEvent(nextState, event);
    upsertApprovalFromEvent(nextState, event);
    upsertEngineFromEvent(nextState, event);
    upsertCheckpointFromEvent(nextState, event);
    updateModulesFromEvent(nextState, event);
    this.state = nextState;
  }

  async bootstrap(): Promise<void> {
    const db = this.open();
    if (!db) {
      this.state = createEmptyState();
      return;
    }

    try {
      const nextState = createEmptyState();
      const eventRows = db
        .prepare(
          `SELECT revision, timestamp, source, payload
           FROM ${TABLE_EVENT_LOG}
           ORDER BY revision ASC`,
        )
        .all() as EventLogBootstrapRow[];
      for (const row of eventRows) {
        nextState.last_event_seq = Math.max(nextState.last_event_seq, row.revision);
        const event = parseEventPayload(row);
        if (!event) {
          continue;
        }
        nextState.recent_events = appendRecentEvent(nextState.recent_events, event, this.maxRecentEvents);
        upsertEngineFromEvent(nextState, event);
        upsertCheckpointFromEvent(nextState, event);
        updateModulesFromEvent(nextState, event);
      }

      const runRows = db
        .prepare(
          `SELECT run_id, workspace_id, agent_id, engine_type, status, created_at, updated_at, error
           FROM ${TABLE_RUNS}
           ORDER BY updated_at ASC`,
        )
        .all() as RunBootstrapRow[];
      for (const row of runRows) {
        const status = toRunHotStatus(row.status);
        if (!status) {
          continue;
        }
        nextState.runs.set(row.run_id, {
          agent_id: row.agent_id ?? undefined,
          engine_type: row.engine_type,
          error: row.error ?? undefined,
          run_id: row.run_id,
          started_at: row.created_at,
          status,
          updated_at: row.updated_at,
          workspace_id: row.workspace_id,
        });
      }

      const approvalRows = db
        .prepare(
          `SELECT approval_id, run_id, tool_name, status, created_at, resolved_at, resolver
           FROM ${TABLE_APPROVAL_QUEUE}
           WHERE status = 'pending'
           ORDER BY created_at ASC`,
        )
        .all() as ApprovalBootstrapRow[];
      for (const row of approvalRows) {
        nextState.pending_approvals.set(row.approval_id, {
          approval_id: row.approval_id,
          requested_at: row.created_at,
          resolved_at: row.resolved_at ?? undefined,
          resolver: toApprovalResolver(row.resolver),
          run_id: row.run_id,
          status: 'pending',
          tool_name: row.tool_name,
        });
      }

      for (const approval of nextState.pending_approvals.values()) {
        const existingRun = nextState.runs.get(approval.run_id);
        if (!existingRun) {
          continue;
        }
        nextState.runs.set(approval.run_id, {
          ...existingRun,
          active_approval_id: approval.approval_id,
          active_tool_name: approval.tool_name,
          status: existingRun.status === 'waiting_approval' ? existingRun.status : 'waiting_approval',
        });
      }

      this.state = nextState;
    } finally {
      db.close();
    }
  }

  snapshot(): CoreHotState {
    const cloned = cloneState(this.state);
    return {
      active_checkpoints: cloned.active_checkpoints,
      engines: cloned.engines,
      last_event_seq: cloned.last_event_seq,
      modules: cloned.modules,
      pending_approvals: cloned.pending_approvals,
      recent_events: cloned.recent_events,
      runs: cloned.runs,
    };
  }

  replaceModules(modules: ModulesHotState): void {
    const nextState = cloneState(this.state);
    nextState.modules = {
      core: cloneModule(modules.core),
      engines: {
        claude: cloneModule(modules.engines.claude),
        codex: cloneModule(modules.engines.codex),
      },
      soul: cloneModule(modules.soul),
    };
    this.state = nextState;
  }

  syncApprovalDecision(change: ApprovalResolutionChange): void {
    const existing = this.state.pending_approvals.get(change.approval_id);
    if (!existing) {
      return;
    }

    const nextState = cloneState(this.state);
    nextState.pending_approvals.delete(change.approval_id);
    const run = nextState.runs.get(existing.run_id);
    if (run) {
      nextState.runs.set(existing.run_id, {
        ...run,
        active_approval_id: undefined,
        active_tool_name: undefined,
        status: run.status === 'waiting_approval' ? 'running' : run.status,
        updated_at: change.resolved_at,
      });
    }
    this.state = nextState;
  }

  syncRunStatus(change: RunStatusChange): void {
    const nextState = cloneState(this.state);
    const existing = nextState.runs.get(change.run_id);
    nextState.runs.set(change.run_id, {
      active_approval_id: change.status === 'waiting_approval' ? existing?.active_approval_id : undefined,
      active_tool_name: change.status === 'waiting_approval' ? existing?.active_tool_name : undefined,
      agent_id: change.agent_id ?? existing?.agent_id,
      engine_type: change.engine_type ?? existing?.engine_type,
      error: change.status === 'failed' ? existing?.error : undefined,
      run_id: change.run_id,
      started_at: existing?.started_at ?? change.updated_at,
      status: change.status,
      updated_at: change.updated_at,
      workspace_id: change.workspace_id ?? existing?.workspace_id,
    });
    if (change.status !== 'waiting_approval') {
      clearPendingApprovalsForRun(nextState, change.run_id);
    }
    if (
      change.status === 'completed'
      || change.status === 'failed'
      || change.status === 'cancelled'
      || change.status === 'interrupted'
      || change.status === 'governance_invalid'
    ) {
      clearCheckpointsForRun(nextState, change.run_id);
    }
    this.state = nextState;
  }

  private open(): Database.Database | null {
    try {
      return createReadConnection(this.dbPath);
    } catch (error) {
      console.warn('[core][hot-state] failed to open state db', error);
      return null;
    }
  }
}

function toApprovalResolver(
  value: string | null,
): ApprovalHotState['resolver'] | undefined {
  if (value === 'policy' || value === 'timeout' || value === 'user') {
    return value;
  }
  return undefined;
}
