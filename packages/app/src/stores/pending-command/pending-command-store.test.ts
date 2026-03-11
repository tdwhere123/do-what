import { beforeEach, describe, expect, it, vi } from 'vitest';
import { dispatchCoreCommand } from '../../lib/commands';
import { CoreHttpError } from '../../lib/core-http-client';
import { resetAckOverlayStore, useAckOverlayStore } from '../ack-overlay';
import { useHotStateStore } from '../hot-state';
import { resetPendingCommandStore, usePendingCommandStore } from './pending-command-store';

describe('pending command store', () => {
  beforeEach(() => {
    resetPendingCommandStore();
    resetAckOverlayStore();
    useHotStateStore.setState({
      connectionState: 'connected',
      coreSessionId: 'core-session-1',
      globalInteractionLock: false,
      health: {
        claude: 'idle',
        codex: 'idle',
        core: 'healthy',
        network: 'healthy',
        soul: 'idle',
      },
    });
  });

  it('creates clientCommandId entries through the unified dispatcher', async () => {
    const result = await dispatchCoreCommand(
      {
        action: 'send-message',
        command: 'event.publish',
        entityType: 'message',
        optimisticPayload: {
          body: 'hello',
        },
        runId: 'run-1',
      },
      {
        postCommand: vi.fn().mockResolvedValue({
          ackId: 'ack-1',
          ok: true,
          revision: 11,
        }),
      },
    );

    expect(result.ok).toBe(true);
    expect(result.entry.clientCommandId.startsWith('client-')).toBe(true);
    expect(result.entry.localSequence).toBe(1);
    expect(usePendingCommandStore.getState().entriesById[result.entry.clientCommandId]?.status).toBe(
      'acked',
    );
  });

  it('keeps message optimistic payloads only in the pending command store', async () => {
    const result = await dispatchCoreCommand(
      {
        action: 'send-message',
        command: 'event.publish',
        entityType: 'message',
        optimisticPayload: {
          body: 'optimistic tail',
        },
        runId: 'run-1',
      },
      {
        postCommand: vi.fn().mockResolvedValue({
          ackId: 'ack-2',
          ok: true,
          revision: 12,
        }),
      },
    );

    expect(result.entry.optimisticPayload).toEqual({
      body: 'optimistic tail',
    });
    expect(useAckOverlayStore.getState().entriesById[result.entry.clientCommandId]).toBeUndefined();
  });

  it('marks unsupported commands as failed', async () => {
    const result = await dispatchCoreCommand(
      {
        action: 'unsupported-command',
        command: 'settings.update',
        entityType: 'settings',
      },
      {
        postCommand: vi.fn().mockRejectedValue(
          new CoreHttpError(
            {
              code: 'command_not_supported',
              message: 'Real Core command routes are not available yet in T006.',
            },
            501,
          ),
        ),
      },
    );

    expect(result.ok).toBe(false);
    expect(result.entry.status).toBe('failed');
    expect(result.entry.errorCode).toBe('command_not_supported');
  });

  it('fails active pending entries when the core session changes', () => {
    const entry = usePendingCommandStore.getState().createPendingEntry({
      action: 'approve',
      coreSessionIdAtSend: 'core-session-1',
      entityType: 'approval',
      runId: 'run-1',
    });

    usePendingCommandStore.getState().markConnectionLost('core-session-2');

    expect(usePendingCommandStore.getState().entriesById[entry.clientCommandId]?.status).toBe(
      'failed',
    );
    expect(
      usePendingCommandStore.getState().entriesById[entry.clientCommandId]?.errorCode,
    ).toBe('COMMAND_CONNECTION_LOST');
  });
});
