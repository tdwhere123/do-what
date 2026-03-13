import {
  type CoreHealthStatus,
  deriveWorkbenchHealthSnapshot,
  type CoreConnectionState,
  type CoreError,
  type ModuleStatusSnapshot,
  type WorkbenchHealthSnapshot,
  type WorkbenchModulesSnapshot,
  type WorkbenchPendingApproval,
  type WorkbenchRunSummary,
  type WorkbenchSnapshot,
  type WorkbenchWorkspaceSummary,
} from '@do-what/protocol';
import { create } from 'zustand';
import type { CoreSessionTransition } from '../../lib/core-session-guard';
import type { NormalizedCoreEvent } from '../../lib/events';

type HotNodeStatus = 'active' | 'done' | 'failed' | 'pending' | 'unknown';
type HotApprovalStatus = 'denied' | 'pending' | 'resolved';
type GovernanceState = 'invalid' | 'unknown' | 'valid';
type RunStatus = WorkbenchRunSummary['status'];

export interface HotNodeSummary {
  readonly nodeId: string;
  readonly revision: number;
  readonly runId: string;
  readonly status: HotNodeStatus;
  readonly title?: string;
}

export interface HotApprovalSummary extends WorkbenchPendingApproval {
  readonly revision: number;
  readonly status: HotApprovalStatus;
}

export interface HotGovernanceSummary {
  readonly reason?: string;
  readonly revision: number;
  readonly runId: string;
  readonly state: GovernanceState;
}

export interface HotStateSnapshot {
  readonly approvalsById: Record<string, HotApprovalSummary>;
  readonly connectionState: CoreConnectionState;
  readonly coreSessionId: string | null;
  readonly globalInteractionLock: boolean;
  readonly governanceByRunId: Record<string, HotGovernanceSummary>;
  readonly health: WorkbenchHealthSnapshot;
  readonly lastError: CoreError | null;
  readonly modules: WorkbenchModulesSnapshot;
  readonly nodesById: Record<string, HotNodeSummary>;
  readonly revision: number;
  readonly runIds: readonly string[];
  readonly runsById: Record<string, WorkbenchRunSummary>;
  readonly workspaceIds: readonly string[];
  readonly workspacesById: Record<string, WorkbenchWorkspaceSummary>;
}

interface HotStateActions {
  applyBootstrapDiagnostics: (input: {
    connectionState: CoreConnectionState;
    error: CoreError | null;
    health: WorkbenchHealthSnapshot;
  }) => void;
  applyConnectionState: (connectionState: CoreConnectionState) => void;
  applyCoreError: (error: CoreError) => void;
  applyNormalizedEvent: (event: NormalizedCoreEvent) => void;
  applySessionTransition: (transition: CoreSessionTransition) => void;
  applyWorkbenchSnapshot: (snapshot: WorkbenchSnapshot) => void;
  reset: () => void;
}

export type HotStateStore = HotStateSnapshot & HotStateActions;

const EMPTY_HEALTH: WorkbenchHealthSnapshot = {
  claude: 'unknown',
  codex: 'unknown',
  core: 'unknown',
  network: 'unknown',
  soul: 'unknown',
};

function createEmptyModule(
  input: Pick<ModuleStatusSnapshot, 'kind' | 'label' | 'moduleId'>,
): ModuleStatusSnapshot {
  return {
    ...input,
    phase: 'probing',
    status: 'disconnected',
    updatedAt: new Date(0).toISOString(),
  };
}

const EMPTY_MODULES: WorkbenchModulesSnapshot = {
  core: createEmptyModule({
    kind: 'core',
    label: 'Core',
    moduleId: 'core',
  }),
  engines: {
    claude: createEmptyModule({
      kind: 'engine',
      label: 'Claude',
      moduleId: 'claude',
    }),
    codex: createEmptyModule({
      kind: 'engine',
      label: 'Codex',
      moduleId: 'codex',
    }),
  },
  soul: createEmptyModule({
    kind: 'soul',
    label: 'Soul',
    moduleId: 'soul',
  }),
};

const TERMINAL_RUN_STATUSES = new Set([
  'cancelled',
  'completed',
  'failed',
  'governance_invalid',
  'interrupted',
]);

function createInitialState(): HotStateSnapshot {
  return {
    approvalsById: {},
    connectionState: 'connecting',
    coreSessionId: null,
    globalInteractionLock: true,
    governanceByRunId: {},
    health: EMPTY_HEALTH,
    lastError: null,
    modules: EMPTY_MODULES,
    nodesById: {},
    revision: 0,
    runIds: [],
    runsById: {},
    workspaceIds: [],
    workspacesById: {},
  };
}

function computeGlobalInteractionLock(
  connectionState: CoreConnectionState,
  health: WorkbenchHealthSnapshot,
): boolean {
  return (
    connectionState === 'disconnected' ||
    connectionState === 'reconnecting' ||
    health.core !== 'healthy'
  );
}

function upsertUnique(items: readonly string[], value: string): string[] {
  return items.includes(value) ? [...items] : [...items, value];
}

function deriveWorkspaceStatus(
  status: WorkbenchRunSummary['status'],
): WorkbenchWorkspaceSummary['status'] {
  if (status === 'started' || status === 'running') {
    return 'running';
  }

  if (
    status === 'waiting_approval' ||
    status === 'failed' ||
    status === 'interrupted' ||
    status === 'governance_invalid'
  ) {
    return 'attention';
  }

  return 'idle';
}

function createPlaceholderRun(runId: string, revision: number): WorkbenchRunSummary {
  return {
    approvalIds: [],
    runId,
    status: 'created',
    title: `Run ${runId}`,
    workspaceId: null,
    lastEventAt: new Date(revision * 1000).toISOString(),
  };
}

function extractWorkspaceId(event: NormalizedCoreEvent): string | null {
  const payload = event.event as Record<string, unknown>;
  return typeof payload.workspaceId === 'string' ? payload.workspaceId : event.workspaceId;
}

function readStringField(
  event: NormalizedCoreEvent,
  key: string,
): string | undefined {
  const payload = event.event as Record<string, unknown>;
  const value = payload[key];
  return typeof value === 'string' ? value : undefined;
}

function readRunStatus(event: NormalizedCoreEvent): RunStatus | null {
  const status = readStringField(event, 'status');
  switch (status) {
    case 'cancelled':
    case 'completed':
    case 'created':
    case 'failed':
    case 'governance_invalid':
    case 'interrupted':
    case 'queued':
    case 'running':
    case 'started':
    case 'waiting_approval':
      return status;
    default:
      return null;
  }
}

function applyNodeEvent(
  nodesById: Record<string, HotNodeSummary>,
  event: NormalizedCoreEvent,
): Record<string, HotNodeSummary> {
  if (!('type' in event.event) || event.event.type !== 'plan_node') {
    return nodesById;
  }

  const payload = event.event as Record<string, unknown>;
  const nodeId = typeof payload.nodeId === 'string' ? payload.nodeId : null;
  const status = typeof payload.status === 'string' ? payload.status : 'unknown';
  const title = typeof payload.title === 'string' ? payload.title : undefined;

  if (nodeId === null) {
    return nodesById;
  }

  return {
    ...nodesById,
    [nodeId]: {
      nodeId,
      revision: event.revision,
      runId: event.runId,
      status: status as HotNodeStatus,
      title,
    },
  };
}

function cloneModule(
  module: ModuleStatusSnapshot,
): ModuleStatusSnapshot {
  return {
    ...module,
    meta: module.meta ? { ...module.meta } : undefined,
  };
}

function applyHealthToModule(
  module: ModuleStatusSnapshot,
  health: CoreHealthStatus,
  updatedAt: string,
  reason?: string,
): ModuleStatusSnapshot {
  if (health === 'unknown') {
    return cloneModule(module);
  }

  const base = cloneModule(module);
  if (health === 'offline') {
    return {
      ...base,
      phase: 'degraded',
      reason: reason ?? base.reason,
      status: 'disconnected',
      updatedAt,
    };
  }

  if (health === 'booting' || health === 'rebooting') {
    return {
      ...base,
      phase: 'probing',
      reason,
      status: 'connected',
      updatedAt,
    };
  }

  if (health === 'healthy' || health === 'idle' || health === 'running') {
    return {
      ...base,
      phase: 'ready',
      reason,
      status: 'connected',
      updatedAt,
    };
  }

  return {
    ...base,
    phase: 'degraded',
    reason: reason ?? base.reason,
    status: 'connected',
    updatedAt,
  };
}

function applyBootstrapDiagnosticsToModules(
  modules: WorkbenchModulesSnapshot,
  input: {
    connectionState: CoreConnectionState;
    error: CoreError | null;
    health: WorkbenchHealthSnapshot;
  },
): WorkbenchModulesSnapshot {
  const updatedAt = new Date().toISOString();
  const coreReason =
    input.connectionState === 'disconnected'
      ? 'Core is unreachable'
      : input.error?.message;

  return {
    ...modules,
    core: applyHealthToModule(modules.core, input.health.core, updatedAt, coreReason),
    engines: {
      claude: applyHealthToModule(modules.engines.claude, input.health.claude, updatedAt),
      codex: applyHealthToModule(modules.engines.codex, input.health.codex, updatedAt),
    },
    soul: applyHealthToModule(modules.soul, input.health.soul, updatedAt),
  };
}

function updateModulesFromEvent(
  modules: WorkbenchModulesSnapshot,
  event: NormalizedCoreEvent,
): WorkbenchModulesSnapshot {
  const systemEvent = readStringField(event, 'event');
  const engineType = readStringField(event, 'engineType');

  if (systemEvent === 'engine_connect' && (engineType === 'claude' || engineType === 'codex')) {
    return {
      ...modules,
      engines: {
        ...modules.engines,
        [engineType]: {
          ...cloneModule(modules.engines[engineType]),
          meta: {
            ...(modules.engines[engineType].meta ?? {}),
            version: readStringField(event, 'version'),
          },
          phase: 'ready',
          reason: undefined,
          status: 'connected',
          updatedAt: event.event.timestamp,
        },
      },
    };
  }

  if (
    systemEvent === 'engine_disconnect' &&
    (engineType === 'claude' || engineType === 'codex')
  ) {
    return {
      ...modules,
      engines: {
        ...modules.engines,
        [engineType]: {
          ...cloneModule(modules.engines[engineType]),
          phase: 'degraded',
          reason: readStringField(event, 'reason'),
          status: 'disconnected',
          updatedAt: event.event.timestamp,
        },
      },
    };
  }

  if (systemEvent === 'circuit_break' && (engineType === 'claude' || engineType === 'codex')) {
    return {
      ...modules,
      engines: {
        ...modules.engines,
        [engineType]: {
          ...cloneModule(modules.engines[engineType]),
          meta: {
            ...(modules.engines[engineType].meta ?? {}),
            failureCount: (event.event as Record<string, unknown>).failureCount,
          },
          phase: 'degraded',
          reason: 'circuit breaker open',
          status: 'connected',
          updatedAt: event.event.timestamp,
        },
      },
    };
  }

  if (systemEvent === 'soul_mode' || readStringField(event, 'operation')) {
    return {
      ...modules,
      soul: {
        ...cloneModule(modules.soul),
        meta:
          systemEvent === 'soul_mode'
            ? {
                ...(modules.soul.meta ?? {}),
                provider: readStringField(event, 'provider'),
                soulMode: readStringField(event, 'soul_mode'),
              }
            : modules.soul.meta,
        phase: 'ready',
        reason: readStringField(event, 'reason'),
        status: 'connected',
        updatedAt: event.event.timestamp,
      },
    };
  }

  return modules;
}

function markCoreBooting(
  modules: WorkbenchModulesSnapshot,
): WorkbenchModulesSnapshot {
  return {
    ...modules,
    core: {
      ...cloneModule(modules.core),
      phase: 'probing',
      reason: undefined,
      status: 'connected',
      updatedAt: new Date().toISOString(),
    },
  };
}

function applyConnectionStateToModules(
  modules: WorkbenchModulesSnapshot,
  connectionState: CoreConnectionState,
): WorkbenchModulesSnapshot {
  if (connectionState === 'connecting') {
    return modules;
  }

  if (connectionState === 'connected') {
    return modules.core.status === 'disconnected' ? markCoreBooting(modules) : modules;
  }

  return {
    ...modules,
    core: {
      ...cloneModule(modules.core),
      phase: connectionState === 'reconnecting' ? 'probing' : 'degraded',
      reason:
        connectionState === 'reconnecting'
          ? 'waiting for Core event stream'
          : 'Core is unreachable',
      status: 'disconnected',
      updatedAt: new Date().toISOString(),
    },
  };
}

function buildSnapshotNodes(
  runs: readonly WorkbenchRunSummary[],
): Record<string, HotNodeSummary> {
  return runs.reduce<Record<string, HotNodeSummary>>((accumulator, run) => {
    if (!run.activeNodeId) {
      return accumulator;
    }

    accumulator[run.activeNodeId] = {
      nodeId: run.activeNodeId,
      revision: 0,
      runId: run.runId,
      status: 'unknown',
    };
    return accumulator;
  }, {});
}

function buildSnapshotGovernance(
  runs: readonly WorkbenchRunSummary[],
): Record<string, HotGovernanceSummary> {
  return runs.reduce<Record<string, HotGovernanceSummary>>((accumulator, run) => {
    accumulator[run.runId] = {
      revision: 0,
      runId: run.runId,
      state: run.status === 'governance_invalid' ? 'invalid' : 'valid',
    };
    return accumulator;
  }, {});
}

function buildSnapshotApprovals(
  approvals: readonly WorkbenchPendingApproval[],
  revision: number,
): Record<string, HotApprovalSummary> {
  return approvals.reduce<Record<string, HotApprovalSummary>>((accumulator, approval) => {
    accumulator[approval.approvalId] = {
      ...approval,
      revision,
      status: 'pending',
    };
    return accumulator;
  }, {});
}

function buildRecord<T extends { [key: string]: unknown }>(
  items: readonly T[],
  key: keyof T,
): Record<string, T> {
  return items.reduce<Record<string, T>>((accumulator, item) => {
    const itemKey = item[key];
    if (typeof itemKey === 'string') {
      accumulator[itemKey] = item;
    }
    return accumulator;
  }, {});
}

function pruneRunApprovals(
  approvalsById: Record<string, HotApprovalSummary>,
  runId: string,
): Record<string, HotApprovalSummary> {
  return Object.fromEntries(
    Object.entries(approvalsById).filter(([, approval]) => approval.runId !== runId),
  );
}

function removeResolvedApproval(
  approvalsById: Record<string, HotApprovalSummary>,
  approvalId: string,
): Record<string, HotApprovalSummary> {
  const next = { ...approvalsById };
  delete next[approvalId];
  return next;
}

export const useHotStateStore = create<HotStateStore>((set, get) => ({
  ...createInitialState(),

  applyBootstrapDiagnostics: (input) => {
    const modules = applyBootstrapDiagnosticsToModules(get().modules, input);
    const health = deriveWorkbenchHealthSnapshot(modules);
    set({
      connectionState: input.connectionState,
      globalInteractionLock: computeGlobalInteractionLock(
        input.connectionState,
        health,
      ),
      health,
      lastError: input.error,
      modules,
    });
  },

  applyConnectionState: (connectionState) => {
    const modules = applyConnectionStateToModules(get().modules, connectionState);
    const health = deriveWorkbenchHealthSnapshot(modules);
    set({
      connectionState,
      globalInteractionLock: computeGlobalInteractionLock(connectionState, health),
      health,
      modules,
    });
  },

  applyCoreError: (error) => {
    set({
      lastError: error,
    });
  },

  applyNormalizedEvent: (event) => {
    const current = get();
    const currentRun =
      current.runsById[event.runId] ?? createPlaceholderRun(event.runId, event.revision);
    const nextRunStatus = readRunStatus(event);
    const approvalId = readStringField(event, 'approvalId');
    const toolName = readStringField(event, 'toolName');
    const governanceReason = readStringField(event, 'reason');
    const workspaceId = extractWorkspaceId(event) ?? currentRun.workspaceId ?? null;
    const nextRunsById = {
      ...current.runsById,
      [event.runId]: {
        ...currentRun,
        lastEventAt: event.event.timestamp,
        runId: event.runId,
        workspaceId,
      },
    };
    let nextApprovalsById = current.approvalsById;
    let nextGovernanceByRunId = current.governanceByRunId;

    if (nextRunStatus) {
      const nextRun = nextRunsById[event.runId];
      nextRunsById[event.runId] = {
        ...nextRun,
        approvalIds:
          nextRunStatus === 'waiting_approval' && approvalId
            ? upsertUnique(nextRun.approvalIds, approvalId)
            : nextRun.approvalIds,
        status: nextRunStatus,
      };

      if (nextRunStatus === 'waiting_approval' && approvalId && toolName) {
        nextApprovalsById = {
          ...nextApprovalsById,
          [approvalId]: {
            approvalId,
            createdAt: event.event.timestamp,
            revision: event.revision,
            runId: event.runId,
            status: 'pending',
            summary: `Approval required for ${toolName}`,
            toolName,
          },
        };
      }

      if (TERMINAL_RUN_STATUSES.has(nextRunStatus)) {
        nextApprovalsById = pruneRunApprovals(nextApprovalsById, event.runId);
      }

      nextGovernanceByRunId = {
        ...nextGovernanceByRunId,
        [event.runId]: {
          reason:
            nextRunStatus === 'governance_invalid'
              ? governanceReason
              : current.governanceByRunId[event.runId]?.reason,
          revision: event.revision,
          runId: event.runId,
          state: nextRunStatus === 'governance_invalid' ? 'invalid' : 'valid',
        },
      };
    }

    if (nextRunStatus && approvalId && nextRunStatus !== 'waiting_approval') {
      nextApprovalsById = removeResolvedApproval(nextApprovalsById, approvalId);
    }

    const nextWorkspacesById =
      workspaceId === null
        ? current.workspacesById
        : {
            ...current.workspacesById,
            [workspaceId]: {
              lastEventAt: event.event.timestamp,
              name: current.workspacesById[workspaceId]?.name ?? workspaceId,
              runIds: upsertUnique(
                current.workspacesById[workspaceId]?.runIds ?? [],
                event.runId,
              ),
              status: nextRunStatus
                ? deriveWorkspaceStatus(nextRunStatus)
                : current.workspacesById[workspaceId]?.status ?? 'idle',
              workspaceId,
            },
          };
    const nextModules = updateModulesFromEvent(current.modules, event);
    const nextHealth = deriveWorkbenchHealthSnapshot(nextModules);

    set({
      approvalsById: nextApprovalsById,
      globalInteractionLock: computeGlobalInteractionLock(
        current.connectionState,
        nextHealth,
      ),
      governanceByRunId: nextGovernanceByRunId,
      health: nextHealth,
      lastError: null,
      modules: nextModules,
      nodesById: applyNodeEvent(current.nodesById, event),
      revision: Math.max(current.revision, event.revision),
      runIds: upsertUnique(current.runIds, event.runId),
      runsById: nextRunsById,
      workspaceIds:
        workspaceId === null
          ? current.workspaceIds
          : upsertUnique(current.workspaceIds, workspaceId),
      workspacesById: nextWorkspacesById,
    });
  },

  applySessionTransition: (transition) => {
    const current = get();
    const nextModules =
      transition.type === 'changed' ? markCoreBooting(current.modules) : current.modules;
    const nextHealth =
      transition.type === 'changed'
        ? deriveWorkbenchHealthSnapshot(nextModules)
        : current.health;

    set({
      coreSessionId: transition.nextCoreSessionId,
      globalInteractionLock: computeGlobalInteractionLock(
        current.connectionState,
        nextHealth,
      ),
      health: nextHealth,
      modules: nextModules,
      revision: transition.type === 'changed' ? 0 : current.revision,
    });
  },

  applyWorkbenchSnapshot: (snapshot) => {
    const runsById = buildRecord(snapshot.runs, 'runId');
    const workspacesById = buildRecord(snapshot.workspaces, 'workspaceId');
    const health = deriveWorkbenchHealthSnapshot(snapshot.modules);

    set({
      approvalsById: buildSnapshotApprovals(snapshot.pendingApprovals, snapshot.revision),
      connectionState: snapshot.connectionState,
      coreSessionId: snapshot.coreSessionId,
      globalInteractionLock: computeGlobalInteractionLock(snapshot.connectionState, health),
      governanceByRunId: buildSnapshotGovernance(snapshot.runs),
      health,
      lastError: null,
      modules: snapshot.modules,
      nodesById: buildSnapshotNodes(snapshot.runs),
      revision: snapshot.revision,
      runIds: snapshot.runs.map((run) => run.runId),
      runsById,
      workspaceIds: snapshot.workspaces.map((workspace) => workspace.workspaceId),
      workspacesById,
    });
  },

  reset: () => {
    set(createInitialState());
  },
}));

export function resetHotStateStore(): void {
  useHotStateStore.getState().reset();
}
