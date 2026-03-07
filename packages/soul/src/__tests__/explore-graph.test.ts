import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { SoulStateStore } from '../db/soul-state-store.js';
import { createExploreGraphHandler } from '../mcp/explore-graph-handler.js';
import { createSoulTestEnv, type SoulTestEnv } from './helpers.js';

const activeEnvs: SoulTestEnv[] = [];

afterEach(() => {
  while (activeEnvs.length > 0) {
    activeEnvs.pop()?.cleanup();
  }
});

describe('graph exploration', () => {
  it('walks the graph breadth-first with depth and limit controls', async () => {
    const env = createSoulTestEnv();
    activeEnvs.push(env);
    const now = new Date().toISOString();

    env.insertSql(
      `INSERT INTO memory_cues (
        cue_id, project_id, gist, source, track, anchors, pointers, confidence,
        impact_level, created_at, updated_at
      ) VALUES
        ('cue-a', 'proj-1', 'Auth service', 'compiler', 'architecture', '["auth"]', '[]', 0.9, 'consolidated', ?, ?),
        ('cue-b', 'proj-1', 'Session service', 'compiler', 'architecture', '["session"]', '[]', 0.8, 'consolidated', ?, ?),
        ('cue-c', 'proj-1', 'Token service', 'compiler', 'architecture', '["token"]', '[]', 0.7, 'consolidated', ?, ?)`,
      [now, now, now, now, now, now],
    );
    env.insertSql(
      `INSERT INTO memory_graph_edges (
        edge_id, source_id, target_id, relation, track, confidence, created_at
      ) VALUES
        ('edge-1', 'cue-a', 'cue-b', 'supports', 'architecture', 0.9, ?),
        ('edge-2', 'cue-b', 'cue-c', 'supports', 'architecture', 0.8, ?)`,
      [now, now],
    );

    const handle = createExploreGraphHandler({
      stateStore: new SoulStateStore(env.dbPath),
    });
    const result = (await handle({
      depth: 2,
      entity_name: 'auth',
      limit: 3,
      track: 'architecture',
    })) as {
      edges: Array<{ edge_id: string }>;
      nodes: Array<{ cueId: string }>;
    };

    assert.deepEqual(result.nodes.map((node) => node.cueId).sort(), [
      'cue-a',
      'cue-b',
      'cue-c',
    ]);
    assert.deepEqual(result.edges.map((edge) => edge.edge_id).sort(), [
      'edge-1',
      'edge-2',
    ]);
  });
});
