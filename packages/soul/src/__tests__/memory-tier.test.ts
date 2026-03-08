import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { afterEach, describe, it } from 'node:test';
import { SoulStateStore } from '../db/soul-state-store.js';
import { SoulWorkerClient } from '../db/worker-client.js';
import { MemoryRepoManager } from '../repo/memory-repo-manager.js';
import { RepoCommitter } from '../write/repo-committer.js';
import { createSoulTestEnv, type SoulTestEnv } from './helpers.js';

const activeEnvs: SoulTestEnv[] = [];
const activeManagers: MemoryRepoManager[] = [];
const activeWorkers: SoulWorkerClient[] = [];

function createRepoCommitter() {
  const env = createSoulTestEnv();
  activeEnvs.push(env);
  const worker = new SoulWorkerClient(env.dbPath);
  activeWorkers.push(worker);
  const stateStore = new SoulStateStore(env.dbPath);
  const memoryRepoManager = new MemoryRepoManager({
    memoryRepoBasePath: env.memoryRepoBasePath,
    stateStore,
    workspaceRoot: env.workspaceRoot,
    writer: worker,
  });
  activeManagers.push(memoryRepoManager);

  return {
    env,
    repoCommitter: new RepoCommitter({ memoryRepoManager }),
  };
}

afterEach(async () => {
  while (activeManagers.length > 0) {
    await activeManagers.pop()?.close();
  }
  while (activeWorkers.length > 0) {
    await activeWorkers.pop()?.close();
  }
  while (activeEnvs.length > 0) {
    activeEnvs.pop()?.cleanup();
  }
});

describe('memory tier repo policy', () => {
  it('skips working and consolidated writes but keeps canon repo commits', async () => {
    const { env, repoCommitter } = createRepoCommitter();

    const working = await repoCommitter.commitCue({
      cueDraft: {
        anchors: ['working'],
        gist: 'working memory',
        pointers: [],
        source: 'compiler',
      },
      cueId: 'cue-working',
      impactLevel: 'working',
      projectId: 'proj-tier',
    });
    const consolidated = await repoCommitter.commitCue({
      cueDraft: {
        anchors: ['consolidated'],
        gist: 'consolidated memory',
        pointers: ['git_commit:abc repo_path:src/consolidated.ts'],
        source: 'compiler',
      },
      cueId: 'cue-consolidated',
      impactLevel: 'consolidated',
      projectId: 'proj-tier',
    });
    const canon = await repoCommitter.commitCue({
      cueDraft: {
        anchors: ['canon'],
        gist: 'canon memory',
        pointers: ['git_commit:abc repo_path:src/canon.ts'],
        source: 'compiler',
      },
      cueId: 'cue-canon',
      impactLevel: 'canon',
      projectId: 'proj-tier',
    });

    assert.equal(working.committed, false);
    assert.equal(consolidated.committed, false);
    assert.equal(canon.committed, true);

    const db = new Database(env.dbPath, { readonly: true });
    const project = db
      .prepare('SELECT memory_repo_path FROM projects WHERE project_id = ?')
      .get('proj-tier') as { memory_repo_path: string } | undefined;
    db.close();

    const repoPath = project?.memory_repo_path ?? '';
    assert.equal(fs.existsSync(path.join(repoPath, 'memory_cues', 'cue-working.md')), false);
    assert.equal(fs.existsSync(path.join(repoPath, 'memory_cues', 'cue-consolidated.md')), false);
    assert.equal(fs.existsSync(path.join(repoPath, 'memory_cues', 'cue-canon.md')), true);
  });
});

