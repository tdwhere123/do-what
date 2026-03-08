import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ReconcileTracker } from '../governance/reconcile-tracker.js';

describe('reconcile-tracker', () => {
  it('serializes a run after the second hard stale decision', () => {
    const tracker = new ReconcileTracker();

    const first = tracker.decide('run-1', 'hard_stale');
    const second = tracker.decide('run-1', 'hard_stale');

    assert.equal(first.allowed, true);
    assert.equal(first.reason, 'hard_stale_reconcile');
    assert.equal(second.allowed, false);
    assert.equal(second.reason, 'hard_stale_serialize');
  });

  it('does not increment reconcile count for ignore or soft_stale', () => {
    const tracker = new ReconcileTracker();

    tracker.decide('run-2', 'ignore');
    tracker.decide('run-2', 'soft_stale');

    assert.equal(tracker.get('run-2'), 0);
  });
});
