import { CoreHttpError } from '../core-http-client';
import { createCoreCommandRequest } from './core-commands';
import type { CoreApiAdapter } from '../core-http-client';
import { useHotStateStore } from '../../stores/hot-state';
import { useAckOverlayStore } from '../../stores/ack-overlay';
import {
  COMMAND_INTERACTION_LOCKED,
  usePendingCommandStore,
  type PendingCommandEntry,
  type PendingCommandReconcileTarget,
} from '../../stores/pending-command';

export interface DispatchCoreCommandInput {
  readonly action: string;
  readonly command: string;
  readonly entityId?: string;
  readonly entityType: string;
  readonly optimisticPayload?: Record<string, unknown>;
  readonly payload?: Record<string, unknown>;
  readonly reconcileTarget?: PendingCommandReconcileTarget;
  readonly runId?: string;
  readonly workspaceId?: string;
}

export interface DispatchCoreCommandResult {
  readonly entry: PendingCommandEntry;
  readonly ok: boolean;
}

export async function dispatchCoreCommand(
  input: DispatchCoreCommandInput,
  coreApi: Pick<CoreApiAdapter, 'postCommand'>,
): Promise<DispatchCoreCommandResult> {
  const entry = usePendingCommandStore.getState().createPendingEntry({
    action: input.action,
    coreSessionIdAtSend: useHotStateStore.getState().coreSessionId,
    entityId: input.entityId,
    entityType: input.entityType,
    optimisticPayload: input.optimisticPayload,
    reconcileTarget: input.reconcileTarget,
    runId: input.runId,
    workspaceId: input.workspaceId,
  });

  if (useHotStateStore.getState().globalInteractionLock) {
    usePendingCommandStore
      .getState()
      .markFailed(
        entry.clientCommandId,
        COMMAND_INTERACTION_LOCKED,
        'Global interaction is locked.',
      );
    return {
      entry: usePendingCommandStore.getState().entriesById[entry.clientCommandId],
      ok: false,
    };
  }

  if (input.entityType !== 'message') {
    useAckOverlayStore.getState().stagePendingEntry(entry);
  }

  try {
    const ack = await coreApi.postCommand(
      createCoreCommandRequest({
        clientCommandId: entry.clientCommandId,
        command: input.command,
        payload: input.payload,
        runId: input.runId,
        workspaceId: input.workspaceId,
      }),
    );
    usePendingCommandStore.getState().markAcked(entry.clientCommandId, ack);
    if (input.entityType !== 'message') {
      useAckOverlayStore.getState().markAcked(entry.clientCommandId, ack);
    }

    return {
      entry: usePendingCommandStore.getState().entriesById[entry.clientCommandId],
      ok: true,
    };
  } catch (error) {
    const code =
      error instanceof CoreHttpError ? error.coreError.code : 'command_dispatch_failed';
    const message =
      error instanceof Error ? error.message : 'Failed to dispatch Core command.';
    usePendingCommandStore.getState().markFailed(entry.clientCommandId, code, message);
    if (input.entityType !== 'message') {
      useAckOverlayStore.getState().markDesynced(entry.clientCommandId, message, code);
    }
    return {
      entry: usePendingCommandStore.getState().entriesById[entry.clientCommandId],
      ok: false,
    };
  }
}
