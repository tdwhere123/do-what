import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ProjectionManager } from '../projection/projection-manager.js';

describe('ProjectionManager', () => {
  it('deduplicates inflight loads and respects invalidation', async () => {
    let now = 1_000;
    let calls = 0;
    const manager = new ProjectionManager({
      definitions: {
        healing_stats_view: {
          load: async () => {
            calls += 1;
            await new Promise((resolve) => setImmediate(resolve));
            return { calls };
          },
          ttlMs: 500,
        },
        pending_soul_proposals: {
          load: async () => [],
          ttlMs: 500,
        },
        run_history_agg: {
          load: async () => ({ runs: [] }),
          ttlMs: 500,
        },
      },
      now: () => now,
    });

    const [first, second] = await Promise.all([
      manager.get<{ calls: number }>('healing_stats_view', 'global'),
      manager.get<{ calls: number }>('healing_stats_view', 'global'),
    ]);
    assert.equal(first.data.calls, 1);
    assert.equal(second.data.calls, 1);
    assert.equal(calls, 1);

    now += 100;
    const cached = await manager.get<{ calls: number }>('healing_stats_view', 'global');
    assert.equal(cached.data.calls, 1);
    assert.equal(calls, 1);

    manager.invalidate('healing_stats_view', 'global');
    now += 100;
    const afterInvalidate = await manager.get<{ calls: number }>('healing_stats_view', 'global');
    assert.equal(afterInvalidate.data.calls, 2);
    assert.equal(calls, 2);
  });
});

