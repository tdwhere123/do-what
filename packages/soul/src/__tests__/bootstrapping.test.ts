import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { afterEach, describe, it } from 'node:test';
import { SoulStateStore } from '../db/soul-state-store.js';
import { SoulWorkerClient } from '../db/worker-client.js';
import { MemoryRepoManager } from '../repo/memory-repo-manager.js';
import { BootstrappingService } from '../write/bootstrapping.js';
import { CueWriter } from '../write/cue-writer.js';
import { RepoCommitter } from '../write/repo-committer.js';
import { createSoulTestEnv, type SoulTestEnv } from './helpers.js';

const activeEnvs: SoulTestEnv[] = [];
const activeManagers: MemoryRepoManager[] = [];
const activeWorkers: SoulWorkerClient[] = [];

function createBootstrappingService(onDeepCompile?: (projectId: string, summary: string) => Promise<unknown>) {
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
  const cueWriter = new CueWriter({ stateStore, writer: worker });
  const repoCommitter = new RepoCommitter({ memoryRepoManager });
  return {
    env,
    service: new BootstrappingService({
      cueWriter,
      onFirstSessionDeepCompile: onDeepCompile,
      repoCommitter,
    }),
  };
}

afterEach(async () => {
  while (activeManagers.length > 0) {
    const manager = activeManagers.pop();
    if (manager) {
      await manager.close();
    }
  }

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

describe('bootstrapping', () => {
  it('seeds consolidated memory and commits it to memory_repo', async () => {
    const { env, service } = createBootstrappingService();

    const cueIds = await service.seedMemory('proj-seed', ['first architecture seed']);

    assert.equal(cueIds.length, 1);

    const db = new Database(env.dbPath, { readonly: true });
    const cue = db
      .prepare('SELECT impact_level FROM memory_cues WHERE cue_id = ?')
      .get(cueIds[0]) as { impact_level: string } | undefined;
    const project = db
      .prepare('SELECT memory_repo_path FROM projects WHERE project_id = ?')
      .get('proj-seed') as { memory_repo_path: string } | undefined;
    db.close();

    assert.equal(cue?.impact_level, 'consolidated');
    assert.equal(
      fs.existsSync(path.join(project?.memory_repo_path ?? '', 'memory_cues', `${cueIds[0]}.md`)),
      true,
    );
  });

  it('invokes the first-session deep compile hook when provided', async () => {
    const calls: Array<{ projectId: string; summary: string }> = [];
    const { service } = createBootstrappingService(async (projectId, summary) => {
      calls.push({ projectId, summary });
    });

    const result = await service.firstSessionDeepCompile('proj-seed', 'session summary');

    assert.equal(result.deferred, false);
    assert.deepEqual(calls, [{ projectId: 'proj-seed', summary: 'session summary' }]);
  });
});
