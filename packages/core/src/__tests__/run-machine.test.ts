import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createRunActor } from '../machines/run-machine.js';

class FakeEventBus {
  public readonly events: Array<Record<string, unknown>> = [];

  publish(event: Record<string, unknown>): void {
    this.events.push(event);
  }
}

class FakeDbWriter {
  public readonly writes: Array<{ params: unknown[]; sql: string }> = [];

  async write(request: { params: unknown[]; sql: string }): Promise<void> {
    this.writes.push(request);
  }
}

describe('RunMachine', () => {
  it('transitions through normal lifecycle', () => {
    const eventBus = new FakeEventBus();
    const dbWriter = new FakeDbWriter();
    const actor = createRunActor({
      dbWriter,
      engineType: 'claude',
      eventBus,
      runId: 'run-normal',
      workspaceId: 'ws-1',
    });
    actor.start();

    actor.send({ type: 'START' });
    assert.equal(String(actor.getSnapshot().value), 'running');

    actor.send({ type: 'COMPLETE' });
    assert.equal(String(actor.getSnapshot().value), 'completed');

    const statuses = eventBus.events.map((event) => String(event.status));
    assert.deepEqual(statuses, ['created', 'started', 'completed']);
    assert.equal(dbWriter.writes.length >= 3, true);
  });

  it('enters waiting_approval and resumes running after approval', () => {
    const eventBus = new FakeEventBus();
    const actor = createRunActor({
      engineType: 'claude',
      eventBus,
      policyEvaluate: () => 'ask',
      runId: 'run-approval',
      workspaceId: 'ws-2',
    });
    actor.start();

    actor.send({ type: 'START' });
    assert.equal(String(actor.getSnapshot().value), 'running');

    actor.send({
      approvalId: 'approval-1',
      args: { command: 'ls' },
      toolName: 'tools.shell_exec',
      type: 'TOOL_REQUEST',
    });
    assert.equal(String(actor.getSnapshot().value), 'waiting_approval');

    actor.send({
      approvalId: 'approval-1',
      approved: true,
      type: 'TOOL_RESOLVED',
    });
    assert.equal(String(actor.getSnapshot().value), 'running');

    const statuses = eventBus.events.map((event) => String(event.status));
    assert.deepEqual(statuses, ['created', 'started', 'waiting_approval']);
  });

  it('interrupts when the same tool fails repeatedly', () => {
    const eventBus = new FakeEventBus();
    const actor = createRunActor({
      agentStuckThreshold: 3,
      engineType: 'claude',
      eventBus,
      runId: 'run-stuck',
      workspaceId: 'ws-3',
    });
    actor.start();

    actor.send({ type: 'START' });
    actor.send({ toolName: 'tools.shell_exec', type: 'TOOL_FAILED' });
    actor.send({ toolName: 'tools.shell_exec', type: 'TOOL_FAILED' });
    actor.send({ toolName: 'tools.shell_exec', type: 'TOOL_FAILED' });

    assert.equal(String(actor.getSnapshot().value), 'interrupted');
    const interrupted = eventBus.events.find(
      (event) => event.status === 'interrupted',
    );
    assert.equal(Boolean(interrupted), true);
  });
});

