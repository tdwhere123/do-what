import type { NormalizedEventBus } from '../../lib/events';
import { resetPendingCommandStore, usePendingCommandStore } from './pending-command-store';

export interface PendingCommandRuntimeDependencies {
  readonly eventBus: NormalizedEventBus;
}

export function startPendingCommandRuntime(
  dependencies: PendingCommandRuntimeDependencies,
): () => void {
  resetPendingCommandStore();

  const unsubscribe = dependencies.eventBus.subscribe((message) => {
    if (message.kind === 'session' && message.transition.type === 'changed') {
      usePendingCommandStore
        .getState()
        .markConnectionLost(message.transition.nextCoreSessionId);
      return;
    }

    if (message.kind !== 'event') {
      return;
    }

    const clientCommandId = message.event.causedBy?.clientCommandId;
    if (!clientCommandId) {
      return;
    }

    const entry = usePendingCommandStore.getState().entriesById[clientCommandId];
    if (!entry) {
      return;
    }

    usePendingCommandStore.getState().markSettled(clientCommandId);
  });

  return () => {
    unsubscribe();
    resetPendingCommandStore();
  };
}
