import type { CoreApiAdapter } from '../core-http-client';
import { useProjectionStore } from '../../stores/projection';
import { usePendingCommandStore } from '../../stores/pending-command';

export async function retryPendingMessageSync(
  clientCommandId: string,
  runId: string,
  coreApi: Pick<CoreApiAdapter, 'getTimelinePage'>,
) {
  try {
    await useProjectionStore.getState().refetchTimeline(coreApi, { runId });
    const projection = useProjectionStore.getState().runTimelines[runId];
    const matched = projection?.entries.some(
      (entry) => entry.causedBy?.clientCommandId === clientCommandId,
    );

    if (matched) {
      usePendingCommandStore.getState().markSettled(clientCommandId);
      return true;
    }

    usePendingCommandStore
      .getState()
      .markDesynced(clientCommandId, 'Message could not be matched after timeline refetch.');
    return false;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Message sync retry failed.';
    usePendingCommandStore.getState().markDesynced(clientCommandId, message);
    return false;
  }
}
