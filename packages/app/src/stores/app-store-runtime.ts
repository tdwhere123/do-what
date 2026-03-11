import type { WorkbenchSnapshot } from '@do-what/protocol';
import type { AppServices } from '../lib/runtime/app-services';
import { startAckOverlayRuntime } from './ack-overlay';
import { startHotStateRuntime } from './hot-state';
import { startPendingCommandRuntime } from './pending-command';
import { startProjectionRuntime, useProjectionStore } from './projection';
import { useUiStore } from './ui';

export interface AppStoreRuntimeOptions {
  readonly bootstrapSnapshot?: WorkbenchSnapshot;
}

export function startAppStoreRuntime(
  services: Pick<AppServices, 'coreApi' | 'eventBus'>,
  options: AppStoreRuntimeOptions = {},
): () => void {
  const cleanupHotState = startHotStateRuntime({
    bootstrapSnapshot: options.bootstrapSnapshot,
    coreApi: services.coreApi,
    eventBus: services.eventBus,
  });
  const cleanupProjection = startProjectionRuntime({
    eventBus: services.eventBus,
  });
  const cleanupPending = startPendingCommandRuntime({
    eventBus: services.eventBus,
  });
  const cleanupAckOverlay = startAckOverlayRuntime({
    coreApi: services.coreApi,
    eventBus: services.eventBus,
  });
  const unsubscribeUi = useUiStore.subscribe((state, previousState) => {
    if (state.selectedRunId && state.selectedRunId !== previousState.selectedRunId) {
      useProjectionStore.getState().mountRun(state.selectedRunId);
    }
  });

  return () => {
    unsubscribeUi();
    cleanupAckOverlay();
    cleanupPending();
    cleanupProjection();
    cleanupHotState();
  };
}
