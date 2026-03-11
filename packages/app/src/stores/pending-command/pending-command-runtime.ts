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
    }
  });

  return () => {
    unsubscribe();
    resetPendingCommandStore();
  };
}
