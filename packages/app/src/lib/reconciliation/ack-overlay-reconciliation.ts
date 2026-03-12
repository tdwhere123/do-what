import type { CoreProbeResult } from '@do-what/protocol';
import type { CoreApiAdapter } from '../core-http-client';
import { useProjectionStore } from '../../stores/projection';
import { useAckOverlayStore } from '../../stores/ack-overlay';
import { usePendingCommandStore } from '../../stores/pending-command';

function createCommittedProbe(
  ackId: string,
  revision: number,
): CoreProbeResult {
  return {
    ackId,
    ok: true,
    revision,
    status: 'committed',
  };
}

async function probeApproval(
  clientCommandId: string,
  coreApi: Pick<CoreApiAdapter, 'getApprovalProbe'>,
) {
  const overlay = useAckOverlayStore.getState().entriesById[clientCommandId];
  if (!overlay?.entityId || overlay.entityType !== 'approval') {
    return null;
  }

  const probe = await coreApi.getApprovalProbe(overlay.entityId);
  if (overlay.ackRevision === null || probe.revision >= overlay.ackRevision) {
    return createCommittedProbe(overlay.ackId ?? clientCommandId, probe.revision);
  }

  return null;
}

async function probeMemory(
  clientCommandId: string,
  coreApi: Pick<CoreApiAdapter, 'getMemoryProbe'>,
) {
  const overlay = useAckOverlayStore.getState().entriesById[clientCommandId];
  if (!overlay?.entityId || overlay.entityType !== 'memory') {
    return null;
  }

  const probe = await coreApi.getMemoryProbe(overlay.entityId);
  if (overlay.ackRevision === null || probe.revision >= overlay.ackRevision) {
    return createCommittedProbe(overlay.ackId ?? clientCommandId, probe.revision);
  }

  return null;
}

async function refetchSettings(
  clientCommandId: string,
  coreApi: Pick<CoreApiAdapter, 'getSettingsSnapshot'>,
) {
  const overlay = useAckOverlayStore.getState().entriesById[clientCommandId];
  if (!overlay || overlay.entityType !== 'settings') {
    return null;
  }

  const snapshot = await coreApi.getSettingsSnapshot();
  if (overlay.ackRevision === null || snapshot.revision >= overlay.ackRevision) {
    return createCommittedProbe(overlay.ackId ?? clientCommandId, snapshot.revision);
  }

  return null;
}

async function refetchWorkbench(
  clientCommandId: string,
  coreApi: Pick<CoreApiAdapter, 'getWorkbenchSnapshot'>,
) {
  const overlay = useAckOverlayStore.getState().entriesById[clientCommandId];
  if (!overlay || overlay.entityType !== 'run') {
    return null;
  }

  const snapshot = await coreApi.getWorkbenchSnapshot();
  const runVisible =
    overlay.entityId === null
      ? snapshot.revision >= (overlay.ackRevision ?? 0)
      : snapshot.runs.some((run) => run.runId === overlay.entityId);
  if (runVisible && (overlay.ackRevision === null || snapshot.revision >= overlay.ackRevision)) {
    return createCommittedProbe(overlay.ackId ?? clientCommandId, snapshot.revision);
  }

  return null;
}

export async function probeOrRefetchAckOverlay(
  clientCommandId: string,
  coreApi: Pick<
    CoreApiAdapter,
    | 'getApprovalProbe'
    | 'getInspectorSnapshot'
    | 'getMemoryProbe'
    | 'getSettingsSnapshot'
    | 'getTimelinePage'
    | 'getWorkbenchSnapshot'
    | 'probeCommand'
  >,
) {
  try {
    const overlay = useAckOverlayStore.getState().entriesById[clientCommandId];
    if (!overlay) {
      return null;
    }

    useAckOverlayStore.getState().beginReconciling(clientCommandId);

    if (overlay.ackId) {
      const commandProbe = await coreApi.probeCommand(overlay.ackId);
      if (!commandProbe.ok || commandProbe.status === 'failed') {
        const message = commandProbe.error ?? 'Core reported a failed command ack.';
        useAckOverlayStore.getState().markDesynced(clientCommandId, message, 'COMMAND_ACK_FAILED');
        usePendingCommandStore.getState().markFailed(clientCommandId, 'COMMAND_ACK_FAILED', message);
        return null;
      }
    }

    const targetedProbe =
      (await probeApproval(clientCommandId, coreApi))
      ?? (await probeMemory(clientCommandId, coreApi))
      ?? (await refetchSettings(clientCommandId, coreApi))
      ?? (await refetchWorkbench(clientCommandId, coreApi));

    if (targetedProbe) {
      useAckOverlayStore.getState().markSettled(clientCommandId, targetedProbe);
      usePendingCommandStore.getState().markSettled(clientCommandId);
      return targetedProbe;
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
      const probe = createCommittedProbe(overlay.ackId ?? clientCommandId, maxRevision);
      useAckOverlayStore.getState().markSettled(clientCommandId, probe);
      usePendingCommandStore.getState().markSettled(clientCommandId);
      return probe;
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
    | 'getApprovalProbe'
    | 'getInspectorSnapshot'
    | 'getMemoryProbe'
    | 'getSettingsSnapshot'
    | 'getTimelinePage'
    | 'getWorkbenchSnapshot'
    | 'probeCommand'
  >,
) {
  return probeOrRefetchAckOverlay(clientCommandId, coreApi);
}
