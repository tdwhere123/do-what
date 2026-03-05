import { randomUUID } from 'node:crypto';
import { assign, createActor, raise, setup, type ActorRefFrom } from 'xstate';
import type { DbWriteRequest } from '../db/worker-client.js';

export interface ApprovalItem {
  approvalId: string;
  args: Readonly<Record<string, unknown>>;
  requestedAt: string;
  runId: string;
  toolName: string;
}

interface ApprovalMachineContext {
  activeItem?: ApprovalItem;
  dbWriter?: {
    write: (request: DbWriteRequest) => Promise<void>;
  };
  now: () => string;
  onDecision?: (decision: ApprovalResolution) => void;
  queue: ApprovalItem[];
  source: string;
  timeoutMs: number;
}

type ApprovalMachineEvent =
  | { type: 'ENQUEUE'; item: ApprovalItem }
  | { approvalId: string; approvedBy?: 'policy' | 'user'; type: 'USER_APPROVE' }
  | { approvalId: string; reason?: string; type: 'USER_DENY' }
  | { approvalId: string; type: 'TIMEOUT' };

export interface ApprovalResolution {
  approvalId: string;
  approved: boolean;
  reason?: string;
  status: 'approved' | 'denied' | 'timeout';
}

export interface ApprovalMachineInput {
  dbWriter?: ApprovalMachineContext['dbWriter'];
  now?: () => string;
  onDecision?: (decision: ApprovalResolution) => void;
  source?: string;
  timeoutMs?: number;
}

const INSERT_APPROVAL_SQL = `
INSERT INTO approval_queue (
  approval_id,
  run_id,
  tool_name,
  args,
  status,
  created_at,
  resolved_at,
  resolver
) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(approval_id) DO UPDATE SET
  run_id = excluded.run_id,
  tool_name = excluded.tool_name,
  args = excluded.args,
  status = excluded.status,
  created_at = excluded.created_at
`;

const UPDATE_APPROVAL_SQL = `
UPDATE approval_queue
SET status = ?, resolved_at = ?, resolver = ?
WHERE approval_id = ?
`;

function persistEnqueue(context: ApprovalMachineContext, item: ApprovalItem): void {
  if (!context.dbWriter) {
    return;
  }

  void context.dbWriter
    .write({
      params: [
        item.approvalId,
        item.runId,
        item.toolName,
        JSON.stringify(item.args),
        'pending',
        item.requestedAt,
        null,
        null,
      ],
      sql: INSERT_APPROVAL_SQL,
    })
    .catch((error) => {
      console.warn('[core][approval-machine] failed to persist enqueue', error);
    });
}

function persistDecision(
  context: ApprovalMachineContext,
  approvalId: string,
  status: 'approved' | 'denied' | 'timeout',
  resolver: 'policy' | 'user' | 'timeout',
): void {
  if (!context.dbWriter) {
    return;
  }

  void context.dbWriter
    .write({
      params: [status, context.now(), resolver, approvalId],
      sql: UPDATE_APPROVAL_SQL,
    })
    .catch((error) => {
      console.warn('[core][approval-machine] failed to persist decision', error);
    });
}

function dequeueNext(context: ApprovalMachineContext): {
  activeItem?: ApprovalItem;
  queue: ApprovalItem[];
} {
  if (context.queue.length === 0) {
    return { activeItem: undefined, queue: [] };
  }
  return {
    activeItem: context.queue[0],
    queue: context.queue.slice(1),
  };
}

function isActiveApproval(
  context: ApprovalMachineContext,
  approvalId: string,
): boolean {
  return context.activeItem?.approvalId === approvalId;
}

export const approvalMachine = setup({
  actions: {
    enqueueItem: assign({
      activeItem: ({ context, event }) => {
        if (event.type !== 'ENQUEUE') {
          return context.activeItem;
        }
        return context.activeItem ?? event.item;
      },
      queue: ({ context, event }) => {
        if (event.type !== 'ENQUEUE') {
          return context.queue;
        }
        if (!context.activeItem) {
          return context.queue;
        }
        return [...context.queue, event.item];
      },
    }),
    persistEnqueue: ({ context, event }) => {
      if (event.type !== 'ENQUEUE') {
        return;
      }
      persistEnqueue(context, event.item);
    },
    persistApproved: ({ context, event }) => {
      if (event.type !== 'USER_APPROVE') {
        return;
      }
      persistDecision(context, event.approvalId, 'approved', event.approvedBy ?? 'user');
    },
    persistDenied: ({ context, event }) => {
      if (event.type !== 'USER_DENY') {
        return;
      }
      persistDecision(context, event.approvalId, 'denied', 'user');
    },
    persistTimeout: ({ context, event }) => {
      if (event.type !== 'TIMEOUT') {
        return;
      }
      persistDecision(context, event.approvalId, 'timeout', 'timeout');
    },
    resolveApproved: assign({
      activeItem: ({ context, event }) => {
        if (event.type !== 'USER_APPROVE' || !isActiveApproval(context, event.approvalId)) {
          return context.activeItem;
        }
        context.onDecision?.({
          approvalId: event.approvalId,
          approved: true,
          status: 'approved',
        });
        return dequeueNext(context).activeItem;
      },
      queue: ({ context, event }) => {
        if (event.type !== 'USER_APPROVE' || !isActiveApproval(context, event.approvalId)) {
          return context.queue;
        }
        return dequeueNext(context).queue;
      },
    }),
    resolveDenied: assign({
      activeItem: ({ context, event }) => {
        if (event.type !== 'USER_DENY' || !isActiveApproval(context, event.approvalId)) {
          return context.activeItem;
        }
        context.onDecision?.({
          approvalId: event.approvalId,
          approved: false,
          reason: event.reason,
          status: 'denied',
        });
        return dequeueNext(context).activeItem;
      },
      queue: ({ context, event }) => {
        if (event.type !== 'USER_DENY' || !isActiveApproval(context, event.approvalId)) {
          return context.queue;
        }
        return dequeueNext(context).queue;
      },
    }),
    resolveTimeout: assign({
      activeItem: ({ context, event }) => {
        if (event.type !== 'TIMEOUT' || !isActiveApproval(context, event.approvalId)) {
          return context.activeItem;
        }
        context.onDecision?.({
          approvalId: event.approvalId,
          approved: false,
          reason: 'approval timeout',
          status: 'timeout',
        });
        return dequeueNext(context).activeItem;
      },
      queue: ({ context, event }) => {
        if (event.type !== 'TIMEOUT' || !isActiveApproval(context, event.approvalId)) {
          return context.queue;
        }
        return dequeueNext(context).queue;
      },
    }),
  },
  delays: {
    approvalTimeout: ({ context }) => context.timeoutMs,
  },
  guards: {
    hasActiveApproval: ({ context }) => Boolean(context.activeItem),
    hasActiveApprovalWithQueue: ({ context }) =>
      Boolean(context.activeItem) && context.queue.length > 0,
    isActiveApproveEvent: ({ context, event }) =>
      event.type === 'USER_APPROVE' && isActiveApproval(context, event.approvalId),
    isActiveApproveEventWithQueue: ({ context, event }) =>
      event.type === 'USER_APPROVE' &&
      isActiveApproval(context, event.approvalId) &&
      context.queue.length > 0,
    isActiveDenyEvent: ({ context, event }) =>
      event.type === 'USER_DENY' && isActiveApproval(context, event.approvalId),
    isActiveDenyEventWithQueue: ({ context, event }) =>
      event.type === 'USER_DENY' &&
      isActiveApproval(context, event.approvalId) &&
      context.queue.length > 0,
    isActiveTimeoutEvent: ({ context, event }) =>
      event.type === 'TIMEOUT' && isActiveApproval(context, event.approvalId),
    isActiveTimeoutEventWithQueue: ({ context, event }) =>
      event.type === 'TIMEOUT' &&
      isActiveApproval(context, event.approvalId) &&
      context.queue.length > 0,
  },
  types: {
    context: {} as ApprovalMachineContext,
    events: {} as ApprovalMachineEvent,
    input: {} as ApprovalMachineInput,
  },
}).createMachine({
  context: ({ input }) => ({
    activeItem: undefined,
    dbWriter: input.dbWriter,
    now: input.now ?? (() => new Date().toISOString()),
    onDecision: input.onDecision,
    queue: [],
    source: input.source ?? 'core.approval-machine',
    timeoutMs: input.timeoutMs ?? 5 * 60 * 1_000,
  }),
  id: 'approval-machine',
  initial: 'idle',
  states: {
    idle: {
      on: {
        ENQUEUE: {
          actions: ['enqueueItem', 'persistEnqueue'],
          target: 'waiting',
        },
      },
    },
    waiting: {
      after: {
        approvalTimeout: {
          actions: raise(({ context }) => ({
            approvalId: context.activeItem?.approvalId ?? '',
            type: 'TIMEOUT',
          })),
          guard: 'hasActiveApproval',
        },
      },
      on: {
        ENQUEUE: {
          actions: ['enqueueItem', 'persistEnqueue'],
        },
        TIMEOUT: [
          {
            actions: ['resolveTimeout', 'persistTimeout'],
            guard: 'isActiveTimeoutEventWithQueue',
            reenter: true,
            target: 'waiting',
          },
          {
            actions: ['resolveTimeout', 'persistTimeout'],
            guard: 'isActiveTimeoutEvent',
            target: 'idle',
          },
        ],
        USER_APPROVE: [
          {
            actions: ['resolveApproved', 'persistApproved'],
            guard: 'isActiveApproveEventWithQueue',
            reenter: true,
            target: 'waiting',
          },
          {
            actions: ['resolveApproved', 'persistApproved'],
            guard: 'isActiveApproveEvent',
            target: 'idle',
          },
        ],
        USER_DENY: [
          {
            actions: ['resolveDenied', 'persistDenied'],
            guard: 'isActiveDenyEventWithQueue',
            reenter: true,
            target: 'waiting',
          },
          {
            actions: ['resolveDenied', 'persistDenied'],
            guard: 'isActiveDenyEvent',
            target: 'idle',
          },
        ],
      },
    },
  },
});

export type ApprovalActor = ActorRefFrom<typeof approvalMachine>;

export class ApprovalMachineController {
  private readonly actor: ApprovalActor;
  private readonly pending = new Map<
    string,
    (resolution: ApprovalResolution) => void
  >();

  constructor(input: ApprovalMachineInput = {}) {
    this.actor = createActor(approvalMachine, {
      input: {
        ...input,
        onDecision: (decision) => {
          this.pending.get(decision.approvalId)?.(decision);
          this.pending.delete(decision.approvalId);
          input.onDecision?.(decision);
        },
      },
    });
    this.actor.start();
  }

  approve(approvalId: string, approvedBy: 'policy' | 'user' = 'user'): void {
    this.actor.send({ approvalId, approvedBy, type: 'USER_APPROVE' });
  }

  deny(approvalId: string, reason?: string): void {
    this.actor.send({ approvalId, reason, type: 'USER_DENY' });
  }

  enqueue(item: Omit<ApprovalItem, 'approvalId' | 'requestedAt'> & {
    approvalId?: string;
    requestedAt?: string;
  }): Promise<ApprovalResolution> {
    const approvalId = item.approvalId ?? randomUUID();
    const approvalItem: ApprovalItem = {
      approvalId,
      args: item.args,
      requestedAt: item.requestedAt ?? new Date().toISOString(),
      runId: item.runId,
      toolName: item.toolName,
    };

    const promise = new Promise<ApprovalResolution>((resolve) => {
      this.pending.set(approvalId, resolve);
    });

    this.actor.send({ item: approvalItem, type: 'ENQUEUE' });
    return promise;
  }

  getSnapshot() {
    return this.actor.getSnapshot();
  }

  stop(): void {
    this.actor.stop();
    for (const [approvalId, resolve] of this.pending.entries()) {
      resolve({
        approvalId,
        approved: false,
        reason: 'approval machine stopped',
        status: 'timeout',
      });
    }
    this.pending.clear();
  }
}
