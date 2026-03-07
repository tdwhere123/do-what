import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { afterEach, describe, it } from 'node:test';
import { SoulStateStore } from '../db/soul-state-store.js';
import { SoulWorkerClient } from '../db/worker-client.js';
import { GitOpsQueue } from '../repo/git-ops-queue.js';
import { runProcess } from '../repo/git-process.js';
import { MemoryRepoManager } from '../repo/memory-repo-manager.js';
import { createSoulTestEnv, type SoulTestEnv } from './helpers.js';

const activeEnvs: SoulTestEnv[] = [];
const activeWorkers: SoulWorkerClient[] = [];

function createManager() {
  const env = createSoulTestEnv();
  activeEnvs.push(env);
  const worker = new SoulWorkerClient(env.dbPath);
  activeWorkers.push(worker);
  return {
    env,
    manager: new MemoryRepoManager({
      memoryRepoBasePath: env.memoryRepoBasePath,
      stateStore: new SoulStateStore(env.dbPath),
      workspaceRoot: env.workspaceRoot,
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

describe('memory repo manager', () => {
  it('initializes a project memory repository and records the binding', async () => {
    const { env, manager } = createManager();

    const binding = await manager.ensureProject('proj-1');

    assert.equal(fs.existsSync(path.join(binding.memoryRepoPath, '.git')), true);
    const log = await runProcess({
      args: ['log', '--oneline'],
      command: 'git',
      cwd: binding.memoryRepoPath,
    });
    assert.match(log.stdout, /initialize repository/);

    const db = new Database(env.dbPath, { readonly: true });
    const row = db
      .prepare('SELECT project_id, memory_repo_path FROM projects WHERE project_id = ?')
      .get('proj-1') as { memory_repo_path: string; project_id: string } | undefined;
    db.close();

    assert.equal(row?.project_id, 'proj-1');
    assert.equal(row?.memory_repo_path, binding.memoryRepoPath);
  });

  it('serializes git operations for the same repository', async () => {
    const queue = new GitOpsQueue();
    const trace: string[] = [];
    const env = createSoulTestEnv();
    activeEnvs.push(env);
    const repoPath = path.join(env.tempDir, 'repo');
    fs.mkdirSync(path.join(repoPath, '.git'), { recursive: true });

    await Promise.all([
      queue.enqueue(repoPath, async () => {
        trace.push('first:start');
        await new Promise((resolve) => {
          setTimeout(resolve, 20);
        });
        trace.push('first:end');
      }),
      queue.enqueue(repoPath, async () => {
        trace.push('second');
      }),
    ]);

    assert.deepEqual(trace, ['first:start', 'first:end', 'second']);
  });
});
