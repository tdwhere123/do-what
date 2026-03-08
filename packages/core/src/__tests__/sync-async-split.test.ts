import assert from 'node:assert/strict';
import { setTimeout as sleep } from 'node:timers/promises';
import { describe, it } from 'node:test';
import type { BaseEvent } from '@do-what/protocol';
import { attachAsyncEventPath, EventDispatcher } from '../event-handler/index.js';
import { EventBus } from '../eventbus/event-bus.js';
import { ProjectionManager } from '../projection/projection-manager.js';
import { AckTracker } from '../state/ack-tracker.js';

class FakeWorkerClient {
  async write(): Promise<void> {}
}

class FakeSseManager {
  public readonly events: BaseEvent[] = [];

  broadcast(event: BaseEvent): void {
    this.events.push(event);
  }
}

describe('sync/async split', () => {
  it('returns ack before async fanout completes and eventually commits it', async () => {
    const sseManager = new FakeSseManager();
    let projectionInvalidations = 0;
    const projectionManager = new ProjectionManager({
      definitions: {
        healing_stats_view: {
          load: async () => ({}),
          ttlMs: 100,
        },
        pending_soul_proposals: {
          load: async () => [],
          ttlMs: 100,
        },
        run_history_agg: {
          load: async () => ({}),
          ttlMs: 100,
        },
      },
    });
    const originalHandleEvent = projectionManager.handleEvent.bind(projectionManager);
    projectionManager.handleEvent = ((event) => {
      projectionInvalidations += 1;
      originalHandleEvent(event);
    }) as typeof projectionManager.handleEvent;

    const eventBus = new EventBus({
      workerClient: new FakeWorkerClient() as never,
    });
    attachAsyncEventPath({
      eventBus,
      projectionManager,
      sseManager: sseManager as never,
    });
    const ackTracker = new AckTracker({
      cleanupDelayMs: 100,
      pendingTimeoutMs: 100,
    });
    const dispatcher = new EventDispatcher({
      ackTracker,
      eventBus,
    });

    const { ack } = dispatcher.dispatch({
      runId: 'run-sync-async',
      source: 'core.run-registry',
      status: 'created',
      timestamp: new Date().toISOString(),
      workspaceId: 'ws-1',
    } as Omit<BaseEvent, 'revision'>);

    assert.equal(ackTracker.get(ack.ack_id)?.status, 'pending');
    await sleep(10);
    assert.equal(ackTracker.get(ack.ack_id)?.status, 'committed');
    assert.equal(sseManager.events.length, 1);
    assert.equal(projectionInvalidations, 1);

    ackTracker.close();
  });
});
