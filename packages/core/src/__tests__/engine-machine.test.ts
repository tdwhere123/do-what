import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createEngineActor } from '../machines/engine-machine.js';

class FakeEventBus {
  public readonly events: Array<Record<string, unknown>> = [];

  publish(event: Record<string, unknown>): void {
    this.events.push(event);
  }
}

describe('EngineMachine', () => {
  it('opens circuit after consecutive parse failures', () => {
    const eventBus = new FakeEventBus();
    const actor = createEngineActor({
      circuitOpenThreshold: 5,
      engineType: 'claude',
      eventBus,
    });
    actor.start();

    actor.send({ type: 'CONNECT', version: '1.0.0' });
    assert.equal(String(actor.getSnapshot().value), 'connected');

    for (let index = 0; index < 5; index += 1) {
      actor.send({ type: 'PARSE_ERROR' });
    }
    assert.equal(String(actor.getSnapshot().value), 'circuit_open');

    const connectEvent = eventBus.events.find((event) => event.event === 'engine_connect');
    const circuitEvent = eventBus.events.find((event) => event.event === 'circuit_break');
    assert.equal(Boolean(connectEvent), true);
    assert.equal(Boolean(circuitEvent), true);
  });

  it('emits disconnect event when disconnected', () => {
    const eventBus = new FakeEventBus();
    const actor = createEngineActor({
      engineType: 'codex',
      eventBus,
    });
    actor.start();

    actor.send({ type: 'CONNECT', version: '1.2.3' });
    actor.send({ reason: 'manual_shutdown', type: 'DISCONNECT' });

    assert.equal(String(actor.getSnapshot().value), 'disconnected');
    const disconnectEvent = eventBus.events.find(
      (event) => event.event === 'engine_disconnect',
    );
    assert.equal(Boolean(disconnectEvent), true);
  });
});

