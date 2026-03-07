import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { BaseEvent } from '@do-what/protocol';
import { EventBus } from '../eventbus/event-bus.js';

class FakeSseManager {
  public readonly events: BaseEvent[] = [];

  broadcast(event: BaseEvent): void {
    this.events.push(event);
  }
}

class FakeWorkerClient {
  public readonly writes: Array<{ params: unknown[]; sql: string }> = [];

  async write(request: { params: unknown[]; sql: string }): Promise<void> {
    this.writes.push(request);
  }
}

describe('EventBus', () => {
  it('publishes events with revision and broadcasts to SSE/listeners', async () => {
    const sseManager = new FakeSseManager();
    const workerClient = new FakeWorkerClient();
    const bus = new EventBus({
      sseManager: sseManager as never,
      workerClient: workerClient as never,
    });

    let received: BaseEvent | undefined;
    bus.on('RunLifecycle.created', (event) => {
      received = event;
    });

    const published = bus.publish({
      runId: 'run-1',
      source: 'core',
      timestamp: new Date().toISOString(),
      type: 'RunLifecycle.created',
    } as Omit<BaseEvent, 'revision'>);

    await new Promise((resolve) => setImmediate(resolve));

    assert.equal(published.revision, 1);
    assert.equal(sseManager.events.length, 1);
    assert.equal(sseManager.events[0].revision, 1);
    assert.equal(received?.revision, 1);
    assert.equal(workerClient.writes.length, 1);
    assert.match(workerClient.writes[0].sql, /INSERT INTO event_log/i);
    assert.equal(workerClient.writes[0].params.length, 6);
  });

  it('increments revisions monotonically', () => {
    const bus = new EventBus({
      sseManager: new FakeSseManager() as never,
      workerClient: new FakeWorkerClient() as never,
    });

    const first = bus.publish({
      runId: 'run-a',
      source: 'core',
      timestamp: new Date().toISOString(),
      type: 'a',
    } as Omit<BaseEvent, 'revision'>);
    const second = bus.publish({
      runId: 'run-b',
      source: 'core',
      timestamp: new Date().toISOString(),
      type: 'b',
    } as Omit<BaseEvent, 'revision'>);

    assert.equal(first.revision, 1);
    assert.equal(second.revision, 2);
  });
});
