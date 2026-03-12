import type { CoreApiAdapter } from '../../lib/core-http-client';
import type { NormalizedEventBus } from '../../lib/events';
import { probeOrRefetchAckOverlay } from '../../lib/reconciliation';
import { useHotStateStore } from '../hot-state';
import { resetAckOverlayStore, useAckOverlayStore } from './ack-overlay-store';

export interface AckOverlayRuntimeDependencies {
  readonly coreApi: Pick<
    CoreApiAdapter,
    | 'getApprovalProbe'
    | 'getInspectorSnapshot'
    | 'getMemoryProbe'
    | 'getSettingsSnapshot'
    | 'getTimelinePage'
    | 'getWorkbenchSnapshot'
    | 'probeCommand'
  >;
  readonly eventBus: NormalizedEventBus;
}

export function startAckOverlayRuntime(
  dependencies: AckOverlayRuntimeDependencies,
): () => void {
  resetAckOverlayStore();

  const maybeReconcile = (clientCommandId: string) => {
    const overlay = useAckOverlayStore.getState().entriesById[clientCommandId];
    if (
      overlay?.status === 'acked' &&
      overlay.ackRevision !== null &&
      overlay.ackRevision !== undefined &&
      useHotStateStore.getState().revision >= overlay.ackRevision
    ) {
      useAckOverlayStore.getState().beginReconciling(clientCommandId);
      void probeOrRefetchAckOverlay(clientCommandId, dependencies.coreApi);
    }
  };

  const unsubscribeBus = dependencies.eventBus.subscribe((message) => {
    if (message.kind === 'session' && message.transition.type === 'changed') {
      useAckOverlayStore
        .getState()
        .markConnectionLost(message.transition.nextCoreSessionId);
    }
  });

  const unsubscribeHotState = useHotStateStore.subscribe((state, previousState) => {
    if (state.revision === previousState.revision) {
      return;
    }

    for (const clientCommandId of useAckOverlayStore.getState().order) {
      maybeReconcile(clientCommandId);
    }
  });

  const unsubscribeOverlay = useAckOverlayStore.subscribe((state, previousState) => {
    for (const clientCommandId of state.order) {
      const current = state.entriesById[clientCommandId];
      const previous = previousState.entriesById[clientCommandId];
      if (current?.status === 'acked' && previous?.status !== 'acked') {
        maybeReconcile(clientCommandId);
      }
    }
  });

  return () => {
    unsubscribeOverlay();
    unsubscribeHotState();
    unsubscribeBus();
    resetAckOverlayStore();
  };
}
