import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { runGit } from '../git/git-process.js';
import { GitOpsQueue } from '../git/gitops-queue.js';
import { WorktreeManager } from '../git/worktree-manager.js';

const tempDirs: string[] = [];

async function createGitRepoFixture(): Promise<string> {
  const repoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'do-what-worktree-'));
  tempDirs.push(repoDir);

  await runGit(['init'], { cwd: repoDir });
  await runGit(['config', 'user.email', 'codex@example.com'], { cwd: repoDir });
  await runGit(['config', 'user.name', 'Codex'], { cwd: repoDir });

  fs.writeFileSync(path.join(repoDir, 'README.md'), '# fixture\n', 'utf8');
  await runGit(['add', 'README.md'], { cwd: repoDir });
  await runGit(['commit', '-m', 'initial commit'], { cwd: repoDir });

  return repoDir;
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const tempDir = tempDirs.pop();
    if (tempDir) {
      fs.rmSync(tempDir, { force: true, recursive: true });
    }
  }
});

describe('WorktreeManager', () => {
  it('allocates, lists, and releases worktrees', async () => {
    const repoPath = await createGitRepoFixture();
    const baseDir = path.join(path.dirname(repoPath), `${path.basename(repoPath)}-worktrees`);
    const manager = new WorktreeManager({
      baseDir,
      gitQueue: new GitOpsQueue(),
    });

    const allocation = await manager.allocate(repoPath, 'run-alpha');
    expect(fs.existsSync(allocation.worktreePath)).toBe(true);
    expect(allocation.branchName).toBe('wt-run-alph');

    const entries = await manager.list(repoPath);
    expect(entries.some((entry) => entry.worktreePath === allocation.worktreePath)).toBe(
      true,
    );

    await manager.release('run-alpha');

    const afterRelease = await manager.list(repoPath);
    expect(
      afterRelease.some((entry) => entry.worktreePath === allocation.worktreePath),
    ).toBe(false);
  });

  it('cleans up orphaned worktrees outside the active run set', async () => {
    const repoPath = await createGitRepoFixture();
    const baseDir = path.join(path.dirname(repoPath), `${path.basename(repoPath)}-worktrees`);
    const manager = new WorktreeManager({ baseDir });

    await manager.allocate(repoPath, 'run-keep');
    const stale = await manager.allocate(repoPath, 'run-stale');

    const removed = await manager.cleanupOrphans(repoPath, ['run-keep']);

    expect(removed).toEqual(['run-stale']);
    expect(fs.existsSync(stale.worktreePath)).toBe(false);
    expect(manager.getAllocation('run-keep')).toBeDefined();
  });
});
