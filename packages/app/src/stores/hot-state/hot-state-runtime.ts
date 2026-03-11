import { normalizeCoreError } from '../../lib/contracts';
import type { NormalizedEventBus } from '../../lib/events';
import type { CoreApiAdapter } from '../../lib/core-http-client';
import { resetHotStateStore, useHotStateStore } from './hot-state-store';

export interface HotStateRuntimeDependencies {
  readonly coreApi: Pick<CoreApiAdapter, 'getWorkbenchSnapshot'>;
  readonly eventBus: NormalizedEventBus;
}

export function startHotStateRuntime(
  dependencies: HotStateRuntimeDependencies,
): () => void {
  let disposed = false;

  resetHotStateStore();

  const refreshSnapshot = async (): Promise<void> => {
    try {
      const snapshot = await dependencies.coreApi.getWorkbenchSnapshot();
      if (!disposed) {
        useHotStateStore.getState().applyWorkbenchSnapshot(snapshot);
      }
    } catch (error) {
      if (!disposed) {
        useHotStateStore
          .getState()
          .applyCoreError(normalizeCoreError(error, 'Failed to refresh workbench snapshot'));
      }
    }
  };

  const unsubscribe = dependencies.eventBus.subscribe((message) => {
    if (message.kind === 'connection') {
      const previous = useHotStateStore.getState().connectionState;
      useHotStateStore.getState().applyConnectionState(message.state);
      if (
        message.state === 'connected' &&
        (previous === 'reconnecting' || previous === 'disconnected')
      ) {
        void refreshSnapshot();
      }
      return;
    }

    if (message.kind === 'error') {
      useHotStateStore.getState().applyCoreError(message.error);
      return;
    }

    if (message.kind === 'event') {
      useHotStateStore.getState().applyNormalizedEvent(message.event);
      return;
    }

    useHotStateStore.getState().applySessionTransition(message.transition);
    if (message.transition.type === 'initialized' || message.transition.type === 'changed') {
      void refreshSnapshot();
    }
  });

  void refreshSnapshot();

  return () => {
    disposed = true;
    unsubscribe();
    resetHotStateStore();
  };
}
