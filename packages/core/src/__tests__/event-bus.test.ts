import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { BaseEvent } from '@do-what/protocol';
import { EventBus } from '../eventbus/event-bus.js';

class FakeWorkerClient {
  public readonly writes: Array<{ params: unknown[]; sql: string }> = [];

  async write(request: { params: unknown[]; sql: string }): Promise<void> {
    this.writes.push(request);
  }
}

describe('EventBus', () => {
  it('publishes events with revision and notifies listeners', async () => {
    const workerClient = new FakeWorkerClient();
    const bus = new EventBus({
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
    assert.equal(received?.revision, 1);
    assert.equal(workerClient.writes.length, 1);
    assert.match(workerClient.writes[0].sql, /INSERT INTO event_log/i);
    assert.equal(workerClient.writes[0].params.length, 6);
  });

  it('increments revisions monotonically', () => {
    const bus = new EventBus({
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

  it('uses eventType, then type, then event, then status for event_log channels', async () => {
    const workerClient = new FakeWorkerClient();
    const bus = new EventBus({
      workerClient: workerClient as never,
    });

    bus.publish({
      event: 'engine_connect',
      eventType: 'explicit-event-type',
      revision: 0,
      runId: 'run-channel-1',
      source: 'core',
      status: 'created',
      timestamp: new Date().toISOString(),
      type: 'token_stream',
    } as BaseEvent);
    bus.publish({
      event: 'engine_disconnect',
      revision: 0,
      runId: 'run-channel-2',
      source: 'core',
      status: 'failed',
      timestamp: new Date().toISOString(),
      type: 'token_stream',
    } as BaseEvent);
    bus.publish({
      event: 'engine_disconnect',
      revision: 0,
      runId: 'run-channel-3',
      source: 'core',
      status: 'failed',
      timestamp: new Date().toISOString(),
    } as BaseEvent);
    bus.publish({
      revision: 0,
      runId: 'run-channel-4',
      source: 'core',
      status: 'failed',
      timestamp: new Date().toISOString(),
    } as BaseEvent);

    await new Promise((resolve) => setImmediate(resolve));

    assert.equal(workerClient.writes[0]?.params[2], 'explicit-event-type');
    assert.equal(workerClient.writes[1]?.params[2], 'token_stream');
    assert.equal(workerClient.writes[2]?.params[2], 'engine_disconnect');
    assert.equal(workerClient.writes[3]?.params[2], 'status:failed');
  });

  it('notifies onAny subscribers for every event', async () => {
    const workerClient = new FakeWorkerClient();
    const bus = new EventBus({
      workerClient: workerClient as never,
    });
    const received: BaseEvent[] = [];

    bus.onAny((event) => {
      received.push(event);
    });

    bus.publish({
      runId: 'run-any-1',
      source: 'core',
      timestamp: new Date().toISOString(),
      type: 'event.one',
    } as Omit<BaseEvent, 'revision'>);
    bus.publish({
      runId: 'run-any-2',
      source: 'core',
      timestamp: new Date().toISOString(),
      type: 'event.two',
    } as Omit<BaseEvent, 'revision'>);

    await new Promise((resolve) => setImmediate(resolve));

    assert.equal(received.length, 2);
    assert.equal(received[0]?.revision, 1);
    assert.equal(received[1]?.revision, 2);
  });
});
