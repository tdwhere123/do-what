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

  it('settles overlays after object probes confirm state', async () => {
    const entry = usePendingCommandStore.getState().createPendingEntry({
      action: 'approval-allow_once',
      coreSessionIdAtSend: 'core-session-1',
      entityId: 'approval-1',
      entityType: 'approval',
      runId: 'run-1',
      reconcileTarget: {
        entityId: 'approval-1',
        entityType: 'approval',
        runId: 'run-1',
      },
    });
    useAckOverlayStore.getState().stagePendingEntry(entry);
    useAckOverlayStore.getState().markAcked(entry.clientCommandId, {
      ackId: 'ack-2',
      ok: true,
      revision: 30,
    });

    const getApprovalProbe = vi.fn().mockResolvedValue({
      approvalId: 'approval-1',
      revision: 30,
      runId: 'run-1',
      status: 'approved',
      summary: 'Approved',
      toolName: 'tools.shell_exec',
      updatedAt: new Date('2026-03-10T00:00:00.000Z').toISOString(),
    });
    const result = await retryAckOverlaySync(entry.clientCommandId, {
      getApprovalProbe,
      getInspectorSnapshot: vi.fn().mockResolvedValue({
        ...ACTIVE_INSPECTOR_FIXTURE,
        revision: 30,
        runId: 'run-1',
      }),
      getMemoryProbe: vi.fn(),
      getSettingsSnapshot: vi.fn(),
      getTimelinePage: vi.fn().mockResolvedValue({
        ...ACTIVE_TIMELINE_FIXTURE,
        revision: 30,
        runId: 'run-1',
      }),
      getWorkbenchSnapshot: vi.fn(),
      probeCommand: vi.fn().mockResolvedValue({
        ackId: 'ack-2',
        ok: true,
        revision: 30,
        status: 'committed',
      }),
    });

    expect(getApprovalProbe).toHaveBeenCalledWith('approval-1');
    expect(result?.status).toBe('committed');
    expect(useAckOverlayStore.getState().entriesById[entry.clientCommandId]?.status).toBe(
      'settled',
    );
  });

  it('reconciles settings overlays through settings snapshots without run refetch', async () => {
    const entry = usePendingCommandStore.getState().createPendingEntry({
      action: 'settings-save',
      coreSessionIdAtSend: 'core-session-1',
      entityId: 'settings-root',
      entityType: 'settings',
      reconcileTarget: {
        entityId: 'settings-root',
        entityType: 'settings',
      },
    });
    useAckOverlayStore.getState().stagePendingEntry(entry);
    useAckOverlayStore.getState().markAcked(entry.clientCommandId, {
      ackId: 'ack-3',
      ok: true,
      revision: 30,
    });

    const getSettingsSnapshot = vi.fn().mockResolvedValue({
      coreSessionId: 'core-session-1',
      lease: {
        leaseId: null,
        lockedFields: [],
        status: 'none',
      },
      revision: 30,
      sections: [],
    });

    await retryAckOverlaySync(entry.clientCommandId, {
      getApprovalProbe: vi.fn(),
      getInspectorSnapshot: vi.fn(),
      getMemoryProbe: vi.fn(),
      getSettingsSnapshot,
      getTimelinePage: vi.fn(),
      getWorkbenchSnapshot: vi.fn(),
      probeCommand: vi.fn().mockResolvedValue({
        ackId: 'ack-3',
        ok: true,
        revision: 30,
        status: 'committed',
      }),
    });

    expect(getSettingsSnapshot).toHaveBeenCalledTimes(1);
    expect(useAckOverlayStore.getState().entriesById[entry.clientCommandId]?.status).toBe(
      'settled',
    );
  });

  it('marks overlays desynced when command probes fail', async () => {
    const entry = usePendingCommandStore.getState().createPendingEntry({
      action: 'approval-deny',
      coreSessionIdAtSend: 'core-session-1',
      entityType: 'approval',
      runId: 'run-1',
    });
    useAckOverlayStore.getState().stagePendingEntry(entry);
    useAckOverlayStore.getState().markAcked(entry.clientCommandId, {
      ackId: 'ack-4',
      ok: true,
      revision: 40,
    });

    await retryAckOverlaySync(entry.clientCommandId, {
      getApprovalProbe: vi.fn(),
      getInspectorSnapshot: vi.fn().mockResolvedValue({
        ...ACTIVE_INSPECTOR_FIXTURE,
        revision: 10,
        runId: 'run-1',
      }),
      getMemoryProbe: vi.fn(),
      getSettingsSnapshot: vi.fn(),
      getTimelinePage: vi.fn().mockResolvedValue({
        ...ACTIVE_TIMELINE_FIXTURE,
        revision: 10,
        runId: 'run-1',
      }),
      getWorkbenchSnapshot: vi.fn(),
      probeCommand: vi.fn().mockResolvedValue({
        ackId: 'ack-4',
        error: 'Mock command rejected',
        ok: false,
        status: 'failed',
      }),
    });

    expect(useAckOverlayStore.getState().entriesById[entry.clientCommandId]?.status).toBe(
      'desynced',
    );
    expect(usePendingCommandStore.getState().entriesById[entry.clientCommandId]?.status).toBe(
      'failed',
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
