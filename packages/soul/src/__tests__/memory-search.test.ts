import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { createSoulToolDispatcher } from '../mcp/dispatcher.js';
import { createSoulTestEnv, type SoulTestEnv } from './helpers.js';

const activeEnvs: SoulTestEnv[] = [];
const activeDispatchers: Array<ReturnType<typeof createSoulToolDispatcher>> = [];

function createTestDispatcher(
  options: {
    isBootstrappingProject?: (projectId: string) => boolean | Promise<boolean>;
  } = {},
) {
  const env = createSoulTestEnv();
  activeEnvs.push(env);
  const events: Array<Record<string, unknown>> = [];
  const dispatcher = createSoulToolDispatcher({
    dbPath: env.dbPath,
    isBootstrappingProject: options.isBootstrappingProject,
    memoryRepoBasePath: env.memoryRepoBasePath,
    publishEvent: (event) => {
      events.push(event as Record<string, unknown>);
    },
    workspaceRoot: env.workspaceRoot,
  });
  activeDispatchers.push(dispatcher);
  return { dispatcher, env, events };
}

afterEach(async () => {
  while (activeDispatchers.length > 0) {
    const dispatcher = activeDispatchers.pop();
    if (dispatcher) {
      await dispatcher.close();
    }
  }

  while (activeEnvs.length > 0) {
    activeEnvs.pop()?.cleanup();
  }
});

describe('memory search', () => {
  it('returns cue refs through the soul.memory_search handler', async () => {
    const { dispatcher, env, events } = createTestDispatcher();
    env.insertSql(
      `INSERT INTO memory_cues (
        cue_id, project_id, gist, source, track, anchors, pointers, confidence,
        impact_level, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        'cue-1',
        'proj-1',
        'authentication logic refactored to service layer',
        'compiler',
        'architecture',
        '["auth","service"]',
        '["git_commit:abc repo_path:src/auth.ts symbol:authenticate"]',
        0.9,
        'consolidated',
        new Date().toISOString(),
        new Date().toISOString(),
      ],
    );

    const result = (await dispatcher.dispatch({
      arguments: {
        limit: 5,
        project_id: 'proj-1',
        query: 'auth service',
      },
      name: 'soul.memory_search',
    })) as {
      budget_used: number;
      cues: Array<{ cueId: string; score: number }>;
      total_found: number;
    };

    assert.equal(result.cues.length, 1);
    assert.equal(result.cues[0]?.cueId, 'cue-1');
    assert.equal((result.cues[0]?.score ?? 0) > 0, true);
    assert.equal(result.total_found, 1);
    assert.equal(result.budget_used > 0, true);
    assert.equal(events.length, 1);
    assert.equal(events[0]?.operation, 'search');
  });

  it('falls back to LIKE and truncates to budget', async () => {
    const { dispatcher, env } = createTestDispatcher();
    env.insertSql(
      `INSERT INTO memory_cues (
        cue_id, project_id, gist, source, track, anchors, pointers, confidence,
        impact_level, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        'cue-2',
        'proj-2',
        'very long authentication note '.repeat(20),
        'compiler',
        'architecture',
        '["auth"]',
        '["git_commit:abc repo_path:src/auth.ts"]',
        0.8,
        'consolidated',
        new Date().toISOString(),
        new Date().toISOString(),
      ],
    );
    env.insertSql('DROP TABLE memory_cues_fts');

    const result = (await dispatcher.dispatch({
      arguments: {
        budget: 10,
        project_id: 'proj-2',
        query: 'auth',
      },
      name: 'soul.memory_search',
    })) as { degraded?: boolean; total_found: number };

    assert.equal(result.total_found, 1);
    assert.equal(result.degraded, true);
  });

  it('includes working cues during bootstrapping only', async () => {
    const { dispatcher, env } = createTestDispatcher({
      isBootstrappingProject: async (projectId) => projectId === 'proj-3',
    });
    env.insertSql(
      `INSERT INTO memory_cues (
        cue_id, project_id, gist, source, track, anchors, pointers, confidence,
        impact_level, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        'cue-3',
        'proj-3',
        'working memory note',
        'compiler',
        'architecture',
        '["auth"]',
        '["git_commit:abc repo_path:src/auth.ts"]',
        0.7,
        'working',
        new Date().toISOString(),
        new Date().toISOString(),
      ],
    );

    const result = (await dispatcher.dispatch({
      arguments: {
        project_id: 'proj-3',
        query: 'working memory',
      },
      name: 'soul.memory_search',
    })) as { cues: Array<{ why?: string }> };

    assert.equal(result.cues.length, 1);
    assert.match(result.cues[0]?.why ?? '', /\[trial\]/);
  });
});
