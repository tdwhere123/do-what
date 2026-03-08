import assert from 'node:assert/strict';
import { setTimeout as sleep } from 'node:timers/promises';
import { describe, it } from 'node:test';
import { AckTracker } from '../state/ack-tracker.js';

describe('AckTracker', () => {
  it('tracks pending, committed, and cleanup lifecycle', async () => {
    const tracker = new AckTracker({
      cleanupDelayMs: 20,
      now: (() => {
        let tick = 0;
        return () => `2026-03-08T10:00:${String(tick++).padStart(2, '0')}.000Z`;
      })(),
      pendingTimeoutMs: 50,
    });

    const ack = tracker.createPending({
      entity_id: 'run-1',
      entity_type: 'run',
      revision: 1,
    });
    assert.equal(tracker.get(ack.ack_id)?.status, 'pending');

    tracker.markCommitted(ack.ack_id);
    assert.equal(tracker.get(ack.ack_id)?.status, 'committed');

    await sleep(40);
    assert.equal(tracker.get(ack.ack_id), null);
    tracker.close();
  });

  it('marks stale pending acknowledgements as failed', async () => {
    const tracker = new AckTracker({
      cleanupDelayMs: 100,
      pendingTimeoutMs: 20,
    });

    const ack = tracker.createPending({
      entity_id: 'event-1',
      entity_type: 'event',
      revision: 1,
    });

    await sleep(40);
    assert.equal(tracker.get(ack.ack_id)?.status, 'failed');
    tracker.close();
  });
});

