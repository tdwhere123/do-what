import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { afterEach, describe, it } from 'node:test';
import { SoulStateStore } from '../db/soul-state-store.js';
import { SoulWorkerClient } from '../db/worker-client.js';
import { CueWriter } from '../write/cue-writer.js';
import { createSoulTestEnv, type SoulTestEnv } from './helpers.js';

const activeEnvs: SoulTestEnv[] = [];
const activeWorkers: SoulWorkerClient[] = [];

function createCueWriter() {
  const env = createSoulTestEnv();
  activeEnvs.push(env);
  const worker = new SoulWorkerClient(env.dbPath);
  activeWorkers.push(worker);
  return {
    env,
    cueWriter: new CueWriter({
      stateStore: new SoulStateStore(env.dbPath),
      writer: worker,
    }),
  };
}

afterEach(async () => {
  while (activeWorkers.length > 0) {
    const worker = activeWorkers.pop();
    if (worker) {
      await worker.close();
    }
  }

  while (activeEnvs.length > 0) {
    activeEnvs.pop()?.cleanup();
  }
});

describe('cue writer', () => {
  it('upserts duplicate cues and promotes working cues to consolidated when reinforced', async () => {
    const { env, cueWriter } = createCueWriter();

    const first = await cueWriter.upsert({
      confidence: 0.6,
      cueDraft: {
        anchors: ['auth'],
        gist: 'auth note',
        pointers: [],
        source: 'compiler',
      },
      impactLevel: 'working',
      projectId: 'proj-1',
    });
    assert.equal(first.inserted, true);
    env.insertSql('UPDATE memory_cues SET hit_count = 3 WHERE cue_id = ?', [first.cueId]);

    const second = await cueWriter.upsert({
      confidence: 0.8,
      cueDraft: {
        anchors: ['auth'],
        gist: 'auth note updated',
        pointers: ['git_commit:abc repo_path:src/auth.ts symbol:authenticate'],
        source: 'compiler',
      },
      impactLevel: 'working',
      projectId: 'proj-1',
    });

    assert.equal(second.inserted, false);
    assert.equal(second.cueId, first.cueId);
    assert.equal(second.impactLevel, 'consolidated');

    const db = new Database(env.dbPath, { readonly: true });
    const row = db
      .prepare('SELECT gist, impact_level FROM memory_cues WHERE cue_id = ?')
      .get(first.cueId) as { gist: string; impact_level: string } | undefined;
    db.close();

    assert.equal(row?.gist, 'auth note updated');
    assert.equal(row?.impact_level, 'consolidated');
  });
});
