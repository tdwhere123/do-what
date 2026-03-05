import assert from 'node:assert/strict';
import { setTimeout as sleep } from 'node:timers/promises';
import { describe, it } from 'node:test';
import { ApprovalMachineController } from '../machines/approval-machine.js';

describe('ApprovalMachine', () => {
  it('auto-denies approval requests on timeout', async () => {
    const machine = new ApprovalMachineController({ timeoutMs: 20 });

    const result = await machine.enqueue({
      args: { command: 'rm -rf /' },
      runId: 'run-timeout',
      toolName: 'tools.shell_exec',
    });

    assert.equal(result.status, 'timeout');
    assert.equal(result.approved, false);
    machine.stop();
  });

  it('processes queue in order with approve/deny actions', async () => {
    const machine = new ApprovalMachineController({ timeoutMs: 1_000 });

    const firstPromise = machine.enqueue({
      approvalId: 'a-1',
      args: { path: '/tmp/one' },
      runId: 'run-queue',
      toolName: 'tools.file_write',
    });
    const secondPromise = machine.enqueue({
      approvalId: 'a-2',
      args: { path: '/tmp/two' },
      runId: 'run-queue',
      toolName: 'tools.file_write',
    });

    machine.approve('a-1');
    const first = await firstPromise;
    assert.equal(first.status, 'approved');
    assert.equal(first.approved, true);

    await sleep(5);
    machine.deny('a-2', 'not allowed');
    const second = await secondPromise;
    assert.equal(second.status, 'denied');
    assert.equal(second.approved, false);

    machine.stop();
  });
});

