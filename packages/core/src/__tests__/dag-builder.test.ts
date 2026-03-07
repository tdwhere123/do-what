import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildDAG, buildDagPlan } from '../integrator/dag-builder.js';

describe('buildDAG', () => {
  it('orders overlapping runs before downstream runs', () => {
    const order = buildDAG([
      { runId: 'A', touched_paths: ['src/auth.ts'] },
      { runId: 'B', touched_paths: ['src/auth.ts', 'src/user.ts'] },
      { runId: 'C', touched_paths: ['src/api.ts'] },
    ]);

    assert.equal(order.includes('A'), true);
    assert.equal(order.includes('B'), true);
    assert.equal(order.includes('C'), true);
    assert.equal(order.indexOf('A') < order.indexOf('B'), true);
  });

  it('degrades to stable order when explicit dependencies form a cycle', () => {
    const plan = buildDagPlan([
      { dependsOnRunIds: ['B'], runId: 'A', touched_paths: ['src/a.ts'] },
      { dependsOnRunIds: ['A'], runId: 'B', touched_paths: ['src/b.ts'] },
    ]);

    assert.equal(plan.degraded, true);
    assert.deepEqual(plan.order, ['A', 'B']);
  });
});
