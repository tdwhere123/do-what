import type { CoreApiAdapter } from '../core-http-client';
import { useProjectionStore } from '../../stores/projection';
import { useAckOverlayStore } from '../../stores/ack-overlay';
import { usePendingCommandStore } from '../../stores/pending-command';

export async function probeOrRefetchAckOverlay(
  clientCommandId: string,
  coreApi: Pick<
    CoreApiAdapter,
    'getInspectorSnapshot' | 'getTimelinePage' | 'probeCommand'
  >,
) {
  try {
    const overlay = useAckOverlayStore.getState().entriesById[clientCommandId];
    if (!overlay) {
      return null;
    }

    useAckOverlayStore.getState().beginReconciling(clientCommandId);

    if (overlay.ackId) {
      const probe = await coreApi.probeCommand(overlay.ackId);
      if (probe.ok && probe.status === 'committed') {
        useAckOverlayStore.getState().markSettled(clientCommandId, probe);
        usePendingCommandStore.getState().markSettled(clientCommandId);
        return probe;
      }
    }

    if (overlay.runId === null) {
      useAckOverlayStore
        .getState()
        .markDesynced(clientCommandId, 'No run context is available for reconciliation.');
      usePendingCommandStore
        .getState()
        .markDesynced(clientCommandId, 'No run context is available for reconciliation.');
      return null;
    }

    const [timelineResult, inspectorResult] = await Promise.allSettled([
      useProjectionStore.getState().refetchTimeline(coreApi, {
        runId: overlay.runId,
      }),
      useProjectionStore.getState().refetchInspector(coreApi, overlay.runId),
    ]);

    const maxRevision = Math.max(
      timelineResult.status === 'fulfilled' ? timelineResult.value.revision : 0,
      inspectorResult.status === 'fulfilled' ? inspectorResult.value.revision : 0,
    );

    if (
      overlay.ackRevision !== null &&
      overlay.ackRevision !== undefined &&
      maxRevision >= overlay.ackRevision
    ) {
      useAckOverlayStore.getState().markSettled(clientCommandId);
      usePendingCommandStore.getState().markSettled(clientCommandId);
      return {
        ackId: overlay.ackId ?? clientCommandId,
        ok: true,
        revision: maxRevision,
        status: 'committed' as const,
      };
    }

    useAckOverlayStore
      .getState()
      .markDesynced(clientCommandId, 'Probe and refetch could not verify the overlay state.');
    usePendingCommandStore
      .getState()
      .markDesynced(clientCommandId, 'Probe and refetch could not verify the overlay state.');
    return null;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Overlay reconciliation failed.';
    useAckOverlayStore.getState().markDesynced(clientCommandId, message);
    usePendingCommandStore.getState().markDesynced(clientCommandId, message);
    return null;
  }
}

export function dismissAckOverlay(clientCommandId: string): void {
  useAckOverlayStore.getState().dismiss(clientCommandId);
}

export async function retryAckOverlaySync(
  clientCommandId: string,
  coreApi: Pick<
    CoreApiAdapter,
    'getInspectorSnapshot' | 'getTimelinePage' | 'probeCommand'
  >,
) {
  return probeOrRefetchAckOverlay(clientCommandId, coreApi);
}
