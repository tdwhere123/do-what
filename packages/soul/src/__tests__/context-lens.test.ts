import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { SoulStateStore } from '../db/soul-state-store.js';
import { ContextLens } from '../context/lens.js';
import { createSoulTestEnv, type SoulTestEnv } from './helpers.js';

const activeEnvs: SoulTestEnv[] = [];

afterEach(() => {
  while (activeEnvs.length > 0) {
    activeEnvs.pop()?.cleanup();
  }
});

describe('context lens', () => {
  it('assembles slots from seeds, expands graph neighbors, and degrades excerpt to gist', async () => {
    const env = createSoulTestEnv();
    activeEnvs.push(env);
    const now = new Date().toISOString();

    env.insertSql(
      `INSERT INTO memory_cues (
        cue_id, project_id, gist, source, focus_surface, dimension, track, anchors,
        pointers, snippet_excerpt, activation_score, confidence, impact_level, pruned, created_at, updated_at
      ) VALUES
        ('cue-1', 'proj-1', 'Auth overview', 'compiler', 'default', 'technical', 'architecture', '["auth"]', '[]', NULL, 9, 0.9, 'canon', 0, ?, ?),
        ('cue-2', 'proj-1', 'Session overview', 'compiler', 'default', 'technical', 'architecture', '["session"]', '[]', 'session excerpt body', 8, 0.8, 'consolidated', 0, ?, ?),
        ('cue-3', 'proj-1', 'Token neighbor', 'compiler', 'default', 'technical', 'architecture', '["token"]', '[]', NULL, 7, 0.7, 'consolidated', 0, ?, ?)`,
      [now, now, now, now, now, now],
    );
    env.insertSql(
      `INSERT INTO memory_graph_edges (
        edge_id, source_id, target_id, relation, track, confidence, created_at
      ) VALUES ('edge-1', 'cue-1', 'cue-3', 'supports', 'architecture', 0.9, ?)`,
      [now],
    );

    const lens = new ContextLens(new SoulStateStore(env.dbPath));
    const result = await lens.assemble({
      anchors: ['auth'],
      budget_tokens: 200,
      dimension: 'technical',
      focus_surface: 'default',
      project_id: 'proj-1',
      seed_cue_ids: ['cue-1'],
      trigger: 'excerpt',
      tracks: ['architecture'],
    });

    assert.equal(result.slots.length >= 2, true);
    assert.equal(result.slots.some((slot) => slot.cue_id === 'cue-3' && slot.origin === 'graph'), true);
    const degradedSeed = result.slots.find((slot) => slot.cue_id === 'cue-1');
    assert.equal(degradedSeed?.content, 'Auth overview');
  });

  it('keeps total tokens inside the hard budget and marks truncation', async () => {
    const env = createSoulTestEnv();
    activeEnvs.push(env);
    const now = new Date().toISOString();

    env.insertSql(
      `INSERT INTO memory_cues (
        cue_id, project_id, gist, source, focus_surface, dimension, anchors, pointers,
        snippet_excerpt, activation_score, confidence, impact_level, pruned, created_at, updated_at
      ) VALUES
        ('budget-1', 'proj-2', ?, 'compiler', 'default', 'technical', '["budget-1"]', '[]', ?, 10, 0.9, 'canon', 0, ?, ?),
        ('budget-2', 'proj-2', ?, 'compiler', 'default', 'technical', '["budget-2"]', '[]', ?, 9, 0.8, 'canon', 0, ?, ?)`,
      [
        'first '.repeat(50),
        'first excerpt '.repeat(50),
        now,
        now,
        'second '.repeat(50),
        'second excerpt '.repeat(50),
        now,
        now,
      ],
    );

    const lens = new ContextLens(new SoulStateStore(env.dbPath));
    const result = await lens.assemble({
      budget_tokens: 20,
      focus_surface: 'default',
      project_id: 'proj-2',
      trigger: 'full',
    });

    assert.equal(result.total_tokens <= 20, true);
    assert.equal(result.truncated, true);
  });
});
