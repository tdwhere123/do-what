import type { CoreCommandAck } from '@do-what/protocol';
import { create } from 'zustand';
import { createClientCommandId } from '../../lib/commands/core-commands';

export const COMMAND_CONNECTION_LOST = 'COMMAND_CONNECTION_LOST';
export const COMMAND_INTERACTION_LOCKED = 'COMMAND_INTERACTION_LOCKED';

export type PendingCommandStatus =
  | 'acked'
  | 'desynced'
  | 'failed'
  | 'pending'
  | 'settled';

export interface PendingCommandReconcileTarget {
  readonly entityId?: string;
  readonly entityType: string;
  readonly runId?: string;
}

export interface PendingCommandEntry {
  readonly ackId?: string;
  readonly ackRevision?: number;
  readonly action: string;
  readonly clientCommandId: string;
  readonly coreSessionIdAtSend: string | null;
  readonly createdAt: string;
  readonly entityId: string | null;
  readonly entityType: string;
  readonly errorCode?: string;
  readonly errorMessage?: string;
  readonly localSequence?: number;
  readonly optimisticPayload?: Record<string, unknown>;
  readonly reconcileTarget?: PendingCommandReconcileTarget;
  readonly runId: string | null;
  readonly status: PendingCommandStatus;
  readonly updatedAt: string;
  readonly workspaceId: string | null;
}

export interface CreatePendingCommandInput {
  readonly action: string;
  readonly coreSessionIdAtSend: string | null;
  readonly entityId?: string;
  readonly entityType: string;
  readonly optimisticPayload?: Record<string, unknown>;
  readonly reconcileTarget?: PendingCommandReconcileTarget;
  readonly runId?: string;
  readonly workspaceId?: string;
}

export interface PendingCommandStoreState {
  readonly entriesById: Record<string, PendingCommandEntry>;
  readonly nextLocalSequence: number;
  readonly order: readonly string[];
}

interface PendingCommandStoreActions {
  createPendingEntry: (input: CreatePendingCommandInput) => PendingCommandEntry;
  markAcked: (clientCommandId: string, ack: CoreCommandAck) => void;
  markConnectionLost: (nextCoreSessionId: string) => void;
  markDesynced: (clientCommandId: string, message: string) => void;
  markFailed: (clientCommandId: string, code: string, message: string) => void;
  markSettled: (clientCommandId: string) => void;
  reset: () => void;
}

export type PendingCommandStore = PendingCommandStoreState & PendingCommandStoreActions;

function createInitialState(): PendingCommandStoreState {
  return {
    entriesById: {},
    nextLocalSequence: 1,
    order: [],
  };
}

function updateEntry(
  entry: PendingCommandEntry,
  patch: Partial<PendingCommandEntry>,
): PendingCommandEntry {
  return {
    ...entry,
    ...patch,
    updatedAt: new Date().toISOString(),
  };
}

export const usePendingCommandStore = create<PendingCommandStore>((set, get) => ({
  ...createInitialState(),

  createPendingEntry: (input) => {
    const state = get();
    const now = new Date().toISOString();
    const clientCommandId = createClientCommandId();
    const entry: PendingCommandEntry = {
      action: input.action,
      clientCommandId,
      coreSessionIdAtSend: input.coreSessionIdAtSend,
      createdAt: now,
      entityId: input.entityId ?? null,
      entityType: input.entityType,
      localSequence:
        input.entityType === 'message' ? state.nextLocalSequence : undefined,
      optimisticPayload: input.optimisticPayload,
      reconcileTarget: input.reconcileTarget,
      runId: input.runId ?? null,
      status: 'pending',
      updatedAt: now,
      workspaceId: input.workspaceId ?? null,
    };

    set({
      entriesById: {
        ...state.entriesById,
        [clientCommandId]: entry,
      },
      nextLocalSequence:
        input.entityType === 'message' ? state.nextLocalSequence + 1 : state.nextLocalSequence,
      order: [...state.order, clientCommandId],
    });

    return entry;
  },

  markAcked: (clientCommandId, ack) => {
    const entry = get().entriesById[clientCommandId];
    if (!entry) {
      return;
    }

    set((state) => ({
      entriesById: {
        ...state.entriesById,
        [clientCommandId]: updateEntry(entry, {
          ackId: ack.ackId,
          ackRevision: ack.revision,
          status: 'acked',
        }),
      },
    }));
  },

  markConnectionLost: (nextCoreSessionId) => {
    set((state) => ({
      entriesById: Object.fromEntries(
        Object.entries(state.entriesById).map(([clientCommandId, entry]) => {
          if (entry.status !== 'pending' && entry.status !== 'acked') {
            return [clientCommandId, entry];
          }

          return [
            clientCommandId,
            updateEntry(entry, {
              errorCode: COMMAND_CONNECTION_LOST,
              errorMessage: `Core session switched to ${nextCoreSessionId}`,
              status: 'failed',
            }),
          ];
        }),
      ),
    }));
  },

  markDesynced: (clientCommandId, message) => {
    const entry = get().entriesById[clientCommandId];
    if (!entry) {
      return;
    }

    set((state) => ({
      entriesById: {
        ...state.entriesById,
        [clientCommandId]: updateEntry(entry, {
          errorMessage: message,
          status: 'desynced',
        }),
      },
    }));
  },

  markFailed: (clientCommandId, code, message) => {
    const entry = get().entriesById[clientCommandId];
    if (!entry) {
      return;
    }

    set((state) => ({
      entriesById: {
        ...state.entriesById,
        [clientCommandId]: updateEntry(entry, {
          errorCode: code,
          errorMessage: message,
          status: 'failed',
        }),
      },
    }));
  },

  markSettled: (clientCommandId) => {
    const entry = get().entriesById[clientCommandId];
    if (!entry) {
      return;
    }

    set((state) => ({
      entriesById: {
        ...state.entriesById,
        [clientCommandId]: updateEntry(entry, {
          status: 'settled',
        }),
      },
    }));
  },

  reset: () => {
    set(createInitialState());
  },
}));

export function resetPendingCommandStore(): void {
  usePendingCommandStore.getState().reset();
}
