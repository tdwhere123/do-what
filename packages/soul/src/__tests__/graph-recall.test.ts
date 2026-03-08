import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { SoulStateStore } from '../db/soul-state-store.js';
import { GraphRecallError, GraphRecallService } from '../graph/recall.js';
import { createSoulTestEnv, type SoulTestEnv } from './helpers.js';

const activeEnvs: SoulTestEnv[] = [];

afterEach(() => {
  while (activeEnvs.length > 0) {
    activeEnvs.pop()?.cleanup();
  }
});

describe('graph recall', () => {
  it('returns bounded one-hop neighbors and excludes pruned cues', async () => {
    const env = createSoulTestEnv();
    activeEnvs.push(env);
    const now = new Date().toISOString();

    env.insertSql(
      `INSERT INTO memory_cues (
        cue_id, project_id, gist, source, anchors, pointers, activation_score,
        confidence, impact_level, pruned, created_at, updated_at
      ) VALUES
        ('seed-a', 'proj-1', 'Auth service', 'compiler', '["auth"]', '[]', 9, 0.9, 'canon', 0, ?, ?),
        ('seed-b', 'proj-1', 'Session service', 'compiler', '["session"]', '[]', 8, 0.8, 'canon', 0, ?, ?),
        ('neighbor-1', 'proj-1', 'Token service', 'compiler', '["token"]', '[]', 7, 0.7, 'consolidated', 0, ?, ?),
        ('neighbor-2', 'proj-1', 'Cookie service', 'compiler', '["cookie"]', '[]', 6, 0.7, 'consolidated', 0, ?, ?),
        ('neighbor-pruned', 'proj-1', 'Legacy edge', 'compiler', '["legacy"]', '[]', 10, 0.5, 'consolidated', 1, ?, ?)`,
      [now, now, now, now, now, now, now, now, now, now],
    );
    env.insertSql(
      `INSERT INTO memory_graph_edges (
        edge_id, source_id, target_id, relation, track, confidence, created_at
      ) VALUES
        ('edge-1', 'seed-a', 'neighbor-1', 'supports', 'architecture', 0.9, ?),
        ('edge-2', 'seed-a', 'neighbor-pruned', 'supports', 'architecture', 0.95, ?),
        ('edge-3', 'seed-b', 'neighbor-2', 'supports', 'architecture', 0.8, ?)`,
      [now, now, now],
    );

    const recall = new GraphRecallService(new SoulStateStore(env.dbPath));
    const result = await recall.recall({
      max_neighbors_per_seed: 5,
      max_seeds: 5,
      project_id: 'proj-1',
      rerank_top_k: 10,
      seed_cue_ids: ['seed-a', 'seed-b'],
    });

    assert.deepEqual(
      result.seeds.map((cue) => cue.cueId),
      ['seed-a', 'seed-b'],
    );
    assert.deepEqual(
      result.neighbors.map((cue) => cue.cueId).sort(),
      ['neighbor-1', 'neighbor-2'],
    );
    assert.equal(result.top_k.length <= 10, true);
    assert.equal(result.neighbors.some((cue) => cue.cueId === 'neighbor-pruned'), false);
  });

  it('rejects requests that exceed the hard seed bound', async () => {
    const env = createSoulTestEnv();
    activeEnvs.push(env);
    const recall = new GraphRecallService(new SoulStateStore(env.dbPath));

    await assert.rejects(
      () =>
        recall.recall({
          max_seeds: 6,
          project_id: 'proj-1',
          seed_cue_ids: ['1', '2', '3', '4', '5', '6'],
        }),
      (error: unknown) =>
        error instanceof GraphRecallError && error.message === 'max_seeds exceeded',
    );
  });
});
