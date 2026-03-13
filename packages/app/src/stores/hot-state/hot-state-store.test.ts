import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { normalizeCoreError } from '../../lib/contracts';
import { NormalizedEventBus, normalizeCoreEvent } from '../../lib/events';
import {
  CORE_RESTART_EVENT_FIXTURE,
  DESYNCED_WORKBENCH_FIXTURE,
  EMPTY_WORKBENCH_FIXTURE,
} from '../../test/fixtures';
import { startHotStateRuntime } from './hot-state-runtime';
import { resetHotStateStore, useHotStateStore } from './hot-state-store';

describe('hot state store', () => {
  beforeEach(() => {
    resetHotStateStore();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    resetHotStateStore();
  });

  it('hydrates from the workbench snapshot', async () => {
    const eventBus = new NormalizedEventBus();
    const stop = startHotStateRuntime({
      coreApi: {
        getWorkbenchSnapshot: vi.fn().mockResolvedValue(DESYNCED_WORKBENCH_FIXTURE),
      },
      eventBus,
    });

    await vi.waitFor(() => {
      expect(useHotStateStore.getState().revision).toBe(31);
    });

    expect(useHotStateStore.getState().coreSessionId).toBe('mock-core-desynced');
    expect(useHotStateStore.getState().runsById['run-desynced-1']?.status).toBe('interrupted');
    stop();
  });

  it('tracks connection state and enables the interaction lock while reconnecting', () => {
    useHotStateStore.getState().applyWorkbenchSnapshot(EMPTY_WORKBENCH_FIXTURE);

    useHotStateStore.getState().applyConnectionState('reconnecting');

    expect(useHotStateStore.getState().connectionState).toBe('reconnecting');
    expect(useHotStateStore.getState().globalInteractionLock).toBe(true);
  });

  it('refreshes the snapshot after a core session change', async () => {
    const eventBus = new NormalizedEventBus();
    const getWorkbenchSnapshot = vi
      .fn()
      .mockResolvedValueOnce(EMPTY_WORKBENCH_FIXTURE)
      .mockResolvedValueOnce(DESYNCED_WORKBENCH_FIXTURE);
    const stop = startHotStateRuntime({
      coreApi: {
        getWorkbenchSnapshot,
      },
      eventBus,
    });

    await vi.waitFor(() => {
      expect(useHotStateStore.getState().coreSessionId).toBe('mock-core-empty');
    });

    eventBus.dispatchSession({
      nextCoreSessionId: 'mock-core-restarted',
      previousCoreSessionId: 'mock-core-empty',
      revision: 1,
      type: 'changed',
    });

    await vi.waitFor(() => {
      expect(useHotStateStore.getState().coreSessionId).toBe('mock-core-desynced');
    });

    stop();
  });

  it('locks global interaction when core health is degraded', () => {
    useHotStateStore.getState().applyWorkbenchSnapshot(DESYNCED_WORKBENCH_FIXTURE);

    expect(useHotStateStore.getState().health.core).toBe('degraded');
    expect(useHotStateStore.getState().globalInteractionLock).toBe(true);
  });

  it('maps bootstrap diagnostics onto the shared modules contract', () => {
    useHotStateStore.getState().applyBootstrapDiagnostics({
      connectionState: 'connected',
      error: {
        code: 'auth_required',
        message: 'Unauthorized',
      },
      health: {
        claude: 'booting',
        codex: 'booting',
        core: 'degraded',
        network: 'healthy',
        soul: 'booting',
      },
    });

    expect(useHotStateStore.getState().modules.core.phase).toBe('degraded');
    expect(useHotStateStore.getState().modules.core.status).toBe('connected');
    expect(useHotStateStore.getState().modules.engines.claude.phase).toBe('probing');
    expect(useHotStateStore.getState().modules.soul.phase).toBe('probing');
  });

  it('updates inactive run summaries directly from normalized events', () => {
    useHotStateStore.getState().applyWorkbenchSnapshot(EMPTY_WORKBENCH_FIXTURE);

    useHotStateStore
      .getState()
      .applyNormalizedEvent(
        normalizeCoreEvent({
          coreSessionId: 'mock-core-empty',
          event: {
            revision: 4,
            runId: 'run-inactive-2',
            source: 'core.server',
            status: 'waiting_approval',
            timestamp: '2026-03-10T11:00:00.000Z',
            toolName: 'tools.shell_exec',
            approvalId: 'approval-inactive-2',
            workspaceId: 'workspace-main',
          },
          revision: 4,
        }),
      );

    expect(useHotStateStore.getState().runsById['run-inactive-2']?.status).toBe('waiting_approval');
    expect(useHotStateStore.getState().approvalsById['approval-inactive-2']?.toolName).toBe(
      'tools.shell_exec',
    );
  });

  it('records runtime errors without mutating control state from projections', () => {
    useHotStateStore.getState().applyWorkbenchSnapshot(EMPTY_WORKBENCH_FIXTURE);

    useHotStateStore
      .getState()
      .applyCoreError(normalizeCoreError({ error: 'stream decode failed' }));

    expect(useHotStateStore.getState().lastError?.message).toBe('stream decode failed');
    expect(useHotStateStore.getState().runsById).toEqual({});
  });

  it('marks core as booting before the post-restart snapshot lands', () => {
    useHotStateStore.getState().applyWorkbenchSnapshot(EMPTY_WORKBENCH_FIXTURE);

    useHotStateStore.getState().applySessionTransition({
      nextCoreSessionId: 'mock-core-restarted',
      previousCoreSessionId: 'mock-core-empty',
      revision: 1,
      type: 'changed',
    });

    expect(useHotStateStore.getState().coreSessionId).toBe('mock-core-restarted');
    expect(useHotStateStore.getState().health.core).toBe('booting');
    expect(useHotStateStore.getState().modules.core.phase).toBe('probing');
  });

  it('derives healthy engine state from system events', () => {
    useHotStateStore.getState().applyWorkbenchSnapshot(EMPTY_WORKBENCH_FIXTURE);

    useHotStateStore
      .getState()
      .applyNormalizedEvent(normalizeCoreEvent(CORE_RESTART_EVENT_FIXTURE));

    expect(useHotStateStore.getState().health.codex).toBe('healthy');
    expect(useHotStateStore.getState().health.core).toBe('healthy');
    expect(useHotStateStore.getState().modules.engines.codex.status).toBe('connected');
  });
});
