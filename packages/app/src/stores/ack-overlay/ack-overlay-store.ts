import type { CoreCommandAck, CoreProbeResult } from '@do-what/protocol';
import { create } from 'zustand';
import {
  COMMAND_CONNECTION_LOST,
  type PendingCommandEntry,
  type PendingCommandReconcileTarget,
} from '../pending-command';

export type AckOverlayStatus =
  | 'acked'
  | 'desynced'
  | 'dismissed'
  | 'pending_overlay'
  | 'reconciling'
  | 'settled';

export interface AckOverlayEntry {
  readonly ackId: string | null;
  readonly ackRevision: number | null;
  readonly action: string;
  readonly clientCommandId: string;
  readonly coreSessionIdAtSend: string | null;
  readonly createdAt: string;
  readonly entityId: string | null;
  readonly entityType: string;
  readonly errorCode?: string;
  readonly errorMessage?: string;
  readonly reconcileTarget?: PendingCommandReconcileTarget;
  readonly runId: string | null;
  readonly status: AckOverlayStatus;
  readonly updatedAt: string;
}

export interface AckOverlayStoreState {
  readonly entriesById: Record<string, AckOverlayEntry>;
  readonly order: readonly string[];
}

interface AckOverlayStoreActions {
  beginReconciling: (clientCommandId: string) => void;
  dismiss: (clientCommandId: string) => void;
  markAcked: (clientCommandId: string, ack: CoreCommandAck) => void;
  markConnectionLost: (nextCoreSessionId: string) => void;
  markDesynced: (clientCommandId: string, message: string, code?: string) => void;
  markSettled: (clientCommandId: string, probe?: CoreProbeResult) => void;
  reset: () => void;
  stagePendingEntry: (entry: PendingCommandEntry) => void;
}

export type AckOverlayStore = AckOverlayStoreState & AckOverlayStoreActions;

function createInitialState(): AckOverlayStoreState {
  return {
    entriesById: {},
    order: [],
  };
}

function shouldTrackOverlay(entry: Pick<PendingCommandEntry, 'entityType'>): boolean {
  return entry.entityType !== 'message';
}

function updateEntry(
  entry: AckOverlayEntry,
  patch: Partial<AckOverlayEntry>,
): AckOverlayEntry {
  return {
    ...entry,
    ...patch,
    updatedAt: new Date().toISOString(),
  };
}

export const useAckOverlayStore = create<AckOverlayStore>((set, get) => ({
  ...createInitialState(),

  beginReconciling: (clientCommandId) => {
    const entry = get().entriesById[clientCommandId];
    if (!entry || entry.status === 'dismissed' || entry.status === 'settled') {
      return;
    }

    set((state) => ({
      entriesById: {
        ...state.entriesById,
        [clientCommandId]: updateEntry(entry, {
          status: 'reconciling',
        }),
      },
    }));
  },

  dismiss: (clientCommandId) => {
    const entry = get().entriesById[clientCommandId];
    if (!entry) {
      return;
    }

    set((state) => ({
      entriesById: {
        ...state.entriesById,
        [clientCommandId]: updateEntry(entry, {
          status: 'dismissed',
        }),
      },
    }));
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
          ackRevision: ack.revision ?? null,
          status: 'acked',
        }),
      },
    }));
  },

  markConnectionLost: (nextCoreSessionId) => {
    set((state) => ({
      entriesById: Object.fromEntries(
        Object.entries(state.entriesById).map(([clientCommandId, entry]) => {
          if (entry.status !== 'pending_overlay' && entry.status !== 'acked') {
            return [clientCommandId, entry];
          }

          return [
            clientCommandId,
            updateEntry(entry, {
              errorCode: COMMAND_CONNECTION_LOST,
              errorMessage: `Core session switched to ${nextCoreSessionId}`,
              status: 'desynced',
            }),
          ];
        }),
      ),
    }));
  },

  markDesynced: (clientCommandId, message, code = 'ACK_OVERLAY_DESYNCED') => {
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
          status: 'desynced',
        }),
      },
    }));
  },

  markSettled: (clientCommandId, probe) => {
    const entry = get().entriesById[clientCommandId];
    if (!entry) {
      return;
    }

    set((state) => ({
      entriesById: {
        ...state.entriesById,
        [clientCommandId]: updateEntry(entry, {
          ackId: probe?.ackId ?? entry.ackId,
          ackRevision: probe?.revision ?? entry.ackRevision,
          status: 'settled',
        }),
      },
    }));
  },

  reset: () => {
    set(createInitialState());
  },

  stagePendingEntry: (entry) => {
    if (!shouldTrackOverlay(entry)) {
      return;
    }

    set((state) => ({
      entriesById: {
        ...state.entriesById,
        [entry.clientCommandId]: {
          ackId: null,
          ackRevision: null,
          action: entry.action,
          clientCommandId: entry.clientCommandId,
          coreSessionIdAtSend: entry.coreSessionIdAtSend,
          createdAt: entry.createdAt,
          entityId: entry.entityId,
          entityType: entry.entityType,
          reconcileTarget: entry.reconcileTarget,
          runId: entry.runId,
          status: 'pending_overlay',
          updatedAt: entry.updatedAt,
        },
      },
      order: state.order.includes(entry.clientCommandId)
        ? state.order
        : [...state.order, entry.clientCommandId],
    }));
  },
}));

export function resetAckOverlayStore(): void {
  useAckOverlayStore.getState().reset();
}
