import { beforeEach, describe, expect, it, vi } from 'vitest';
import { retryAckOverlaySync } from '../../lib/reconciliation';
import { ACTIVE_INSPECTOR_FIXTURE, ACTIVE_TIMELINE_FIXTURE } from '../../test/fixtures';
import { resetPendingCommandStore, usePendingCommandStore } from '../pending-command';
import { resetProjectionStore } from '../projection';
import { resetAckOverlayStore, useAckOverlayStore } from './ack-overlay-store';

describe('ack-overlay store', () => {
  beforeEach(() => {
    resetAckOverlayStore();
    resetPendingCommandStore();
    resetProjectionStore();
  });

  it('does not track message entries', () => {
    const messageEntry = usePendingCommandStore.getState().createPendingEntry({
      action: 'send-message',
      coreSessionIdAtSend: 'core-session-1',
      entityType: 'message',
      runId: 'run-1',
    });

    useAckOverlayStore.getState().stagePendingEntry(messageEntry);

    expect(useAckOverlayStore.getState().entriesById[messageEntry.clientCommandId]).toBeUndefined();
  });

  it('moves acked overlays into reconciling once revision catches up', () => {
    const entry = usePendingCommandStore.getState().createPendingEntry({
      action: 'approve',
      coreSessionIdAtSend: 'core-session-1',
      entityType: 'approval',
      runId: 'run-1',
    });
    useAckOverlayStore.getState().stagePendingEntry(entry);
    useAckOverlayStore.getState().markAcked(entry.clientCommandId, {
      ackId: 'ack-1',
      ok: true,
      revision: 20,
    });

    useAckOverlayStore.getState().beginReconciling(entry.clientCommandId);

    expect(useAckOverlayStore.getState().entriesById[entry.clientCommandId]?.status).toBe(
      'reconciling',
    );
  });

  it('settles overlays after probe-or-refetch succeeds', async () => {
    const entry = usePendingCommandStore.getState().createPendingEntry({
      action: 'settings-save',
      coreSessionIdAtSend: 'core-session-1',
      entityType: 'settings',
      runId: 'run-1',
      reconcileTarget: {
        entityType: 'settings',
        runId: 'run-1',
      },
    });
    useAckOverlayStore.getState().stagePendingEntry(entry);
    useAckOverlayStore.getState().markAcked(entry.clientCommandId, {
      ackId: 'ack-2',
      ok: true,
      revision: 30,
    });

    const result = await retryAckOverlaySync(entry.clientCommandId, {
      getInspectorSnapshot: vi.fn().mockResolvedValue({
        ...ACTIVE_INSPECTOR_FIXTURE,
        revision: 30,
        runId: 'run-1',
      }),
      getTimelinePage: vi.fn().mockResolvedValue({
        ...ACTIVE_TIMELINE_FIXTURE,
        revision: 30,
        runId: 'run-1',
      }),
      probeCommand: vi.fn().mockResolvedValue({
        ackId: 'ack-2',
        ok: true,
        revision: 30,
        status: 'committed',
      }),
    });

    expect(result?.status).toBe('committed');
    expect(useAckOverlayStore.getState().entriesById[entry.clientCommandId]?.status).toBe(
      'settled',
    );
  });

  it('marks overlays desynced when probe and refetch cannot confirm state', async () => {
    const entry = usePendingCommandStore.getState().createPendingEntry({
      action: 'approval-deny',
      coreSessionIdAtSend: 'core-session-1',
      entityType: 'approval',
      runId: 'run-1',
    });
    useAckOverlayStore.getState().stagePendingEntry(entry);
    useAckOverlayStore.getState().markAcked(entry.clientCommandId, {
      ackId: 'ack-3',
      ok: true,
      revision: 40,
    });

    await retryAckOverlaySync(entry.clientCommandId, {
      getInspectorSnapshot: vi.fn().mockResolvedValue({
        ...ACTIVE_INSPECTOR_FIXTURE,
        revision: 10,
        runId: 'run-1',
      }),
      getTimelinePage: vi.fn().mockResolvedValue({
        ...ACTIVE_TIMELINE_FIXTURE,
        revision: 10,
        runId: 'run-1',
      }),
      probeCommand: vi.fn().mockResolvedValue({
        ackId: 'ack-3',
        ok: false,
        status: 'pending',
      }),
    });

    expect(useAckOverlayStore.getState().entriesById[entry.clientCommandId]?.status).toBe(
      'desynced',
    );
  });

  it('keeps overlays visible until explicit dismiss', () => {
    const entry = usePendingCommandStore.getState().createPendingEntry({
      action: 'approval-approve',
      coreSessionIdAtSend: 'core-session-1',
      entityType: 'approval',
      runId: 'run-1',
    });
    useAckOverlayStore.getState().stagePendingEntry(entry);
    useAckOverlayStore.getState().markDesynced(entry.clientCommandId, 'Need user action.');

    expect(useAckOverlayStore.getState().entriesById[entry.clientCommandId]).toBeTruthy();

    useAckOverlayStore.getState().dismiss(entry.clientCommandId);

    expect(useAckOverlayStore.getState().entriesById[entry.clientCommandId]?.status).toBe(
      'dismissed',
    );
  });
});
