import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { BaseEvent } from '@do-what/protocol';
import { HotStateManager } from '../state/hot-state-manager.js';

function createEvent(
  revision: number,
  payload: Omit<BaseEvent, 'revision'> & Record<string, unknown>,
): BaseEvent {
  return {
    ...payload,
    revision,
  } as BaseEvent;
}

describe('HotStateManager', () => {
  it('keeps snapshots immutable across apply calls', () => {
    const manager = new HotStateManager({
      dbPath: ':memory:',
    });

    manager.apply(
      createEvent(1, {
        engineType: 'claude',
        runId: 'run-1',
        source: 'core.run-registry',
        status: 'created',
        timestamp: '2026-03-08T09:00:00.000Z',
        workspaceId: 'ws-1',
      }),
    );

    const firstSnapshot = manager.snapshot();
    manager.apply(
      createEvent(2, {
        approvalId: 'approval-1',
        runId: 'run-1',
        source: 'core.run-registry',
        status: 'waiting_approval',
        timestamp: '2026-03-08T09:00:01.000Z',
        toolName: 'tools.shell_exec',
      }),
    );
    const secondSnapshot = manager.snapshot();

    assert.equal(firstSnapshot.last_event_seq, 1);
    assert.equal(firstSnapshot.pending_approvals.size, 0);
    assert.equal(secondSnapshot.last_event_seq, 2);
    assert.equal(secondSnapshot.pending_approvals.size, 1);
  });

  it('syncs approval resolution back into run hot state', () => {
    const manager = new HotStateManager({
      dbPath: ':memory:',
    });

    manager.apply(
      createEvent(1, {
        engineType: 'claude',
        runId: 'run-1',
        source: 'core.run-registry',
        status: 'created',
        timestamp: '2026-03-08T09:00:00.000Z',
        workspaceId: 'ws-1',
      }),
    );
    manager.apply(
      createEvent(2, {
        approvalId: 'approval-1',
        runId: 'run-1',
        source: 'core.run-registry',
        status: 'waiting_approval',
        timestamp: '2026-03-08T09:00:01.000Z',
        toolName: 'tools.shell_exec',
      }),
    );

    manager.syncApprovalDecision({
      approval_id: 'approval-1',
      approved: true,
      resolved_at: '2026-03-08T09:00:02.000Z',
      resolver: 'user',
      status: 'approved',
    });

    const snapshot = manager.snapshot();
    assert.equal(snapshot.pending_approvals.size, 0);
    assert.equal(snapshot.runs.get('run-1')?.status, 'running');
    assert.equal(snapshot.runs.get('run-1')?.active_approval_id, undefined);
  });

  it('tracks governance_invalid as a terminal run status', () => {
    const manager = new HotStateManager({
      dbPath: ':memory:',
    });

    manager.apply(
      createEvent(1, {
        engineType: 'claude',
        runId: 'run-2',
        source: 'core.run-registry',
        status: 'created',
        timestamp: '2026-03-08T09:10:00.000Z',
        workspaceId: 'ws-2',
      }),
    );
    manager.apply(
      createEvent(2, {
        reason: 'lease invalidated',
        runId: 'run-2',
        source: 'core.governance',
        status: 'governance_invalid',
        timestamp: '2026-03-08T09:10:01.000Z',
      }),
    );

    const snapshot = manager.snapshot();
    assert.equal(snapshot.runs.get('run-2')?.status, 'governance_invalid');
  });
});
