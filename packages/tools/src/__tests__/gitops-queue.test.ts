import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { afterEach, describe, expect, it } from 'vitest';
import { GitCommandError } from '../git/git-process.js';
import { GitOpsQueue } from '../git/gitops-queue.js';

const tempDirs: string[] = [];

function createRepoFixture(): string {
  const repoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'do-what-gitops-'));
  tempDirs.push(repoDir);
  fs.mkdirSync(path.join(repoDir, '.git'), { recursive: true });
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

describe('GitOpsQueue', () => {
  it('serializes operations for the same repo path', async () => {
    const queue = new GitOpsQueue();
    const repoPath = createRepoFixture();
    const steps: string[] = [];

    let releaseFirst: (() => void) | undefined;
    const first = queue.enqueue(repoPath, async () => {
      steps.push('first-start');
      await new Promise<void>((resolve) => {
        releaseFirst = resolve;
      });
      steps.push('first-end');
      return 'first';
    });

    const second = queue.enqueue(repoPath, async () => {
      steps.push('second-start');
      steps.push('second-end');
      return 'second';
    });

    await sleep(0);
    expect(steps).toEqual(['first-start']);

    releaseFirst?.();

    await expect(first).resolves.toBe('first');
    await expect(second).resolves.toBe('second');
    expect(steps).toEqual([
      'first-start',
      'first-end',
      'second-start',
      'second-end',
    ]);
  });

  it('retries index.lock failures and removes stale locks after retry exhaustion', async () => {
    const repoPath = createRepoFixture();
    const indexLockPath = path.join(repoPath, '.git', 'index.lock');
    fs.writeFileSync(indexLockPath, 'locked', 'utf8');
    const staleTime = Date.now() - 61_000;
    fs.utimesSync(indexLockPath, staleTime / 1000, staleTime / 1000);

    const waits: number[] = [];
    const warnings: Array<{ details: Record<string, unknown>; message: string }> = [];
    const queue = new GitOpsQueue({
      jitterMs: 0,
      logger: {
        warn(details, message) {
          warnings.push({ details, message });
        },
      },
      random: () => 0.5,
      sleep: async (ms) => {
        waits.push(ms);
      },
    });

    let attempts = 0;
    const result = await queue.enqueue(repoPath, async () => {
      attempts += 1;
      if (attempts <= 5) {
        throw new GitCommandError('index.lock busy', {
          args: ['status'],
          cwd: repoPath,
          exitCode: 128,
          stderr: "fatal: Unable to create '.git/index.lock': File exists.",
          stdout: '',
        });
      }
      return 'recovered';
    });

    expect(result).toBe('recovered');
    expect(attempts).toBe(6);
    expect(waits).toEqual([100, 200, 400, 800]);
    expect(fs.existsSync(indexLockPath)).toBe(false);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.message).toContain('removing stale git index.lock');
  });
});
