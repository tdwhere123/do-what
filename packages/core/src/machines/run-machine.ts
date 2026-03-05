import type { RunLifecycleEvent } from '@do-what/protocol';
import { assign, createActor, setup, type ActorRefFrom } from 'xstate';
import { AGENT_STUCK_THRESHOLD } from '../config.js';
import type { DbWriteRequest } from '../db/worker-client.js';

type PolicyResult = 'allow' | 'ask' | 'deny';
type RunTerminalStatus = 'completed' | 'failed' | 'cancelled' | 'interrupted';
type RunMachineStatus =
  | 'idle'
  | 'created'
  | 'started'
  | 'running'
  | 'waiting_approval'
  | RunTerminalStatus;

export interface RunMachineInput {
  agentId?: string;
  agentStuckThreshold?: number;
  dbWriter?: {
    write: (request: DbWriteRequest) => Promise<void>;
  };
  engineType: string;
  eventBus?: {
    publish: (event: Omit<RunLifecycleEvent, 'revision'>) => unknown;
  };
  now?: () => string;
  policyEvaluate?: (
    toolName: string,
    args: Readonly<Record<string, unknown>>,
    context: { runId: string; workspaceId: string },
  ) => PolicyResult;
  runId: string;
  source?: string;
  workspaceId: string;
}

interface RunMachineContext {
  activeApprovalId?: string;
  activeToolName?: string;
  agentId?: string;
  agentStuckThreshold: number;
  createdAt: string;
  dbWriter?: RunMachineInput['dbWriter'];
  engineType: string;
  error?: string;
  eventBus?: RunMachineInput['eventBus'];
  now: () => string;
  policyEvaluate?: RunMachineInput['policyEvaluate'];
  runId: string;
  source: string;
  status: RunMachineStatus;
  toolFailureCounts: Record<string, number>;
  workspaceId: string;
}

export type RunMachineEvent =
  | { type: 'START' }
  | {
      type: 'TOOL_REQUEST';
      approvalId: string;
      args: Readonly<Record<string, unknown>>;
      toolName: string;
    }
  | {
      type: 'TOOL_RESOLVED';
      approvalId: string;
      approved: boolean;
      reason?: string;
    }
  | {
      type: 'TOOL_FAILED';
      reason?: string;
      toolName: string;
    }
  | { type: 'COMPLETE' }
  | { type: 'FAIL'; error: string }
  | { type: 'CANCEL'; cancelledBy: string }
  | { type: 'INTERRUPT'; reason: 'agent_stuck' | 'core_restart' | 'network_error' };

export const RUN_TERMINAL_STATES: readonly RunTerminalStatus[] = [
  'completed',
  'failed',
  'cancelled',
  'interrupted',
];

const RUN_UPSERT_SQL = `
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
  workspace_id = excluded.workspace_id,
  agent_id = excluded.agent_id,
  engine_type = excluded.engine_type,
  status = excluded.status,
  updated_at = excluded.updated_at,
  completed_at = excluded.completed_at,
  error = excluded.error,
  metadata = excluded.metadata
`;

function evaluatePolicy(
  context: RunMachineContext,
  event: Extract<RunMachineEvent, { type: 'TOOL_REQUEST' }>,
): PolicyResult {
  if (!context.policyEvaluate) {
    return 'ask';
  }

  return context.policyEvaluate(event.toolName, event.args, {
    runId: context.runId,
    workspaceId: context.workspaceId,
  });
}

function getFailureCount(context: RunMachineContext, toolName: string): number {
  return context.toolFailureCounts[toolName] ?? 0;
}

function getFailureToolFromEvent(
  context: RunMachineContext,
  event: RunMachineEvent,
): string | undefined {
  if (event.type === 'TOOL_FAILED') {
    return event.toolName;
  }
  if (event.type === 'TOOL_REQUEST') {
    return event.toolName;
  }
  if (event.type === 'TOOL_RESOLVED' && event.approved === false) {
    return context.activeToolName;
  }
  return undefined;
}

function willReachAgentStuckThreshold(
  context: RunMachineContext,
  event: RunMachineEvent,
): boolean {
  const toolName = getFailureToolFromEvent(context, event);
  if (!toolName) {
    return false;
  }
  return getFailureCount(context, toolName) + 1 >= context.agentStuckThreshold;
}

function isTerminalStatus(status: RunMachineStatus): status is RunTerminalStatus {
  return RUN_TERMINAL_STATES.includes(status as RunTerminalStatus);
}

function persistRunStatus(
  context: RunMachineContext,
  status: RunMachineStatus,
  error?: string,
): void {
  if (!context.dbWriter) {
    return;
  }

  const updatedAt = context.now();
  const completedAt = isTerminalStatus(status) ? updatedAt : null;
  void context.dbWriter
    .write({
      params: [
        context.runId,
        context.workspaceId,
        context.agentId ?? null,
        context.engineType,
        status,
        context.createdAt,
        updatedAt,
        completedAt,
        error ?? null,
        null,
      ],
      sql: RUN_UPSERT_SQL,
    })
    .catch((writeError) => {
      console.warn('[core][run-machine] failed to persist run status', writeError);
    });
}

function publishRunLifecycle(
  context: RunMachineContext,
  event: Omit<RunLifecycleEvent, 'revision'>,
): void {
  context.eventBus?.publish(event);
}

function buildBaseLifecycleEvent(context: RunMachineContext) {
  return {
    runId: context.runId,
    source: context.source,
    timestamp: context.now(),
  };
}

function getInterruptReason(
  event: RunMachineEvent,
): Extract<RunMachineEvent, { type: 'INTERRUPT' }>['reason'] | undefined {
  if (event.type === 'INTERRUPT') {
    return event.reason;
  }
  if (event.type === 'TOOL_FAILED' || event.type === 'TOOL_REQUEST') {
    return 'agent_stuck';
  }
  if (event.type === 'TOOL_RESOLVED' && event.approved === false) {
    return 'agent_stuck';
  }
  return undefined;
}

export const runMachine = setup({
  actions: {
    markCancelled: assign({
      status: () => 'cancelled' as const,
    }),
    markCompleted: assign({
      status: () => 'completed' as const,
    }),
    markCreated: assign({
      status: () => 'created' as const,
    }),
    markFailed: assign({
      error: ({ event }) => (event.type === 'FAIL' ? event.error : undefined),
      status: () => 'failed' as const,
    }),
    markInterrupted: assign({
      status: () => 'interrupted' as const,
    }),
    markRunning: assign({
      activeApprovalId: () => undefined,
      activeToolName: () => undefined,
      status: () => 'running' as const,
    }),
    markStarted: assign({
      status: () => 'started' as const,
    }),
    markWaitingApproval: assign({
      activeApprovalId: ({ event }) =>
        event.type === 'TOOL_REQUEST' ? event.approvalId : undefined,
      activeToolName: ({ event }) =>
        event.type === 'TOOL_REQUEST' ? event.toolName : undefined,
      status: () => 'waiting_approval' as const,
    }),
    publishCancelled: ({ context, event }) => {
      if (event.type !== 'CANCEL') {
        return;
      }
      publishRunLifecycle(context, {
        ...buildBaseLifecycleEvent(context),
        cancelledBy: event.cancelledBy,
        status: 'cancelled',
      });
    },
    publishCompleted: ({ context }) => {
      publishRunLifecycle(context, {
        ...buildBaseLifecycleEvent(context),
        status: 'completed',
      });
    },
    publishCreated: ({ context }) => {
      publishRunLifecycle(context, {
        ...buildBaseLifecycleEvent(context),
        agentId: context.agentId,
        engineType: context.engineType,
        status: 'created',
        workspaceId: context.workspaceId,
      });
    },
    publishFailed: ({ context, event }) => {
      if (event.type !== 'FAIL') {
        return;
      }
      publishRunLifecycle(context, {
        ...buildBaseLifecycleEvent(context),
        error: event.error,
        status: 'failed',
      });
    },
    publishInterrupted: ({ context, event }) => {
      const reason = getInterruptReason(event);
      if (!reason) {
        return;
      }
      publishRunLifecycle(context, {
        ...buildBaseLifecycleEvent(context),
        reason,
        status: 'interrupted',
      });
    },
    publishStarted: ({ context }) => {
      publishRunLifecycle(context, {
        ...buildBaseLifecycleEvent(context),
        status: 'started',
      });
    },
    publishWaitingApproval: ({ context, event }) => {
      if (event.type !== 'TOOL_REQUEST') {
        return;
      }
      publishRunLifecycle(context, {
        ...buildBaseLifecycleEvent(context),
        approvalId: event.approvalId,
        status: 'waiting_approval',
        toolName: event.toolName,
      });
    },
    recordToolFailure: assign({
      toolFailureCounts: ({ context, event }) => {
        const toolName = getFailureToolFromEvent(context, event);
        if (!toolName) {
          return context.toolFailureCounts;
        }
        return {
          ...context.toolFailureCounts,
          [toolName]: getFailureCount(context, toolName) + 1,
        };
      },
    }),
    resetToolFailure: assign({
      toolFailureCounts: ({ context, event }) => {
        const toolName =
          event.type === 'TOOL_REQUEST'
            ? event.toolName
            : event.type === 'TOOL_RESOLVED'
              ? context.activeToolName
              : undefined;
        if (!toolName) {
          return context.toolFailureCounts;
        }
        return {
          ...context.toolFailureCounts,
          [toolName]: 0,
        };
      },
    }),
    saveCancelled: ({ context }) => {
      persistRunStatus(context, 'cancelled');
    },
    saveCompleted: ({ context }) => {
      persistRunStatus(context, 'completed');
    },
    saveCreated: ({ context }) => {
      persistRunStatus(context, 'created');
    },
    saveFailed: ({ context, event }) => {
      persistRunStatus(context, 'failed', event.type === 'FAIL' ? event.error : undefined);
    },
    saveInterrupted: ({ context }) => {
      persistRunStatus(context, 'interrupted');
    },
    saveRunning: ({ context }) => {
      persistRunStatus(context, 'running');
    },
    saveStarted: ({ context }) => {
      persistRunStatus(context, 'started');
    },
    saveWaitingApproval: ({ context }) => {
      persistRunStatus(context, 'waiting_approval');
    },
  },
  guards: {
    shouldAskApproval: ({ context, event }) =>
      event.type === 'TOOL_REQUEST' && evaluatePolicy(context, event) === 'ask',
    shouldInterruptOnDeniedRequest: ({ context, event }) =>
      event.type === 'TOOL_REQUEST' &&
      evaluatePolicy(context, event) === 'deny' &&
      willReachAgentStuckThreshold(context, event),
    shouldInterruptOnDeniedResolution: ({ context, event }) =>
      event.type === 'TOOL_RESOLVED' &&
      event.approved === false &&
      willReachAgentStuckThreshold(context, event),
    shouldInterruptOnToolFailure: ({ context, event }) =>
      event.type === 'TOOL_FAILED' && willReachAgentStuckThreshold(context, event),
    shouldTreatAsDeniedResolution: ({ event }) =>
      event.type === 'TOOL_RESOLVED' && event.approved === false,
    shouldTreatAsDeniedRequest: ({ context, event }) =>
      event.type === 'TOOL_REQUEST' && evaluatePolicy(context, event) === 'deny',
  },
  types: {
    context: {} as RunMachineContext,
    events: {} as RunMachineEvent,
    input: {} as RunMachineInput,
  },
}).createMachine({
  context: ({ input }) => ({
    agentId: input.agentId,
    agentStuckThreshold: input.agentStuckThreshold ?? AGENT_STUCK_THRESHOLD,
    createdAt: input.now?.() ?? new Date().toISOString(),
    dbWriter: input.dbWriter,
    engineType: input.engineType,
    eventBus: input.eventBus,
    now: input.now ?? (() => new Date().toISOString()),
    policyEvaluate: input.policyEvaluate,
    runId: input.runId,
    source: input.source ?? 'core.run-machine',
    status: 'idle',
    toolFailureCounts: {},
    workspaceId: input.workspaceId,
  }),
  id: 'run-machine',
  initial: 'idle',
  states: {
    cancelled: { type: 'final' },
    completed: { type: 'final' },
    created: {
      always: {
        actions: ['markStarted', 'saveStarted', 'publishStarted'],
        target: 'started',
      },
    },
    failed: { type: 'final' },
    idle: {
      on: {
        START: {
          actions: ['markCreated', 'saveCreated', 'publishCreated'],
          target: 'created',
        },
      },
    },
    interrupted: { type: 'final' },
    running: {
      entry: ['saveRunning'],
      on: {
        CANCEL: {
          actions: ['markCancelled', 'saveCancelled', 'publishCancelled'],
          target: 'cancelled',
        },
        COMPLETE: {
          actions: ['markCompleted', 'saveCompleted', 'publishCompleted'],
          target: 'completed',
        },
        FAIL: {
          actions: ['markFailed', 'saveFailed', 'publishFailed'],
          target: 'failed',
        },
        INTERRUPT: {
          actions: ['markInterrupted', 'saveInterrupted', 'publishInterrupted'],
          target: 'interrupted',
        },
        TOOL_FAILED: [
          {
            actions: [
              'recordToolFailure',
              'markInterrupted',
              'saveInterrupted',
              'publishInterrupted',
            ],
            guard: 'shouldInterruptOnToolFailure',
            target: 'interrupted',
          },
          {
            actions: ['recordToolFailure'],
          },
        ],
        TOOL_REQUEST: [
          {
            actions: [
              'recordToolFailure',
              'markInterrupted',
              'saveInterrupted',
              'publishInterrupted',
            ],
            guard: 'shouldInterruptOnDeniedRequest',
            target: 'interrupted',
          },
          {
            actions: ['recordToolFailure'],
            guard: 'shouldTreatAsDeniedRequest',
          },
          {
            actions: ['markWaitingApproval', 'saveWaitingApproval', 'publishWaitingApproval'],
            guard: 'shouldAskApproval',
            target: 'waiting_approval',
          },
          {
            actions: ['resetToolFailure'],
          },
        ],
      },
    },
    started: {
      always: {
        actions: ['markRunning', 'saveRunning'],
        target: 'running',
      },
    },
    waiting_approval: {
      on: {
        CANCEL: {
          actions: ['markCancelled', 'saveCancelled', 'publishCancelled'],
          target: 'cancelled',
        },
        INTERRUPT: {
          actions: ['markInterrupted', 'saveInterrupted', 'publishInterrupted'],
          target: 'interrupted',
        },
        TOOL_RESOLVED: [
          {
            actions: [
              'recordToolFailure',
              'markInterrupted',
              'saveInterrupted',
              'publishInterrupted',
            ],
            guard: 'shouldInterruptOnDeniedResolution',
            target: 'interrupted',
          },
          {
            actions: ['recordToolFailure', 'markRunning', 'saveRunning'],
            guard: 'shouldTreatAsDeniedResolution',
            target: 'running',
          },
          {
            actions: ['resetToolFailure', 'markRunning', 'saveRunning'],
            target: 'running',
          },
        ],
      },
    },
  },
});

export type RunActor = ActorRefFrom<typeof runMachine>;

export function createRunActor(input: RunMachineInput): RunActor {
  return createActor(runMachine, { input });
}
