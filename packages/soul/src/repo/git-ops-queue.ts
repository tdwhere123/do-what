import fs from 'node:fs';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

const LOCK_STALE_AFTER_MS = 60_000;
const LOCK_RETRY_DELAYS_MS = [100, 200, 400];

export class GitOpsQueue {
  private readonly pending = new Map<string, Promise<void>>();

  async enqueue<T>(repoPath: string, operation: () => Promise<T>): Promise<T> {
    const previous = this.pending.get(repoPath) ?? Promise.resolve();
    const current = previous.catch(() => undefined).then(async () => {
      await this.waitForLock(repoPath);
      return operation();
    });
    const queued = current.then(() => undefined, () => undefined);
    this.pending.set(repoPath, queued);

    try {
      return await current;
    } finally {
      if (this.pending.get(repoPath) === queued) {
        this.pending.delete(repoPath);
      }
    }
  }

  private async waitForLock(repoPath: string): Promise<void> {
    const lockPath = path.join(repoPath, '.git', 'index.lock');

    for (let attempt = 0; attempt <= LOCK_RETRY_DELAYS_MS.length; attempt += 1) {
      if (!fs.existsSync(lockPath)) {
        return;
      }

      if (attempt === LOCK_RETRY_DELAYS_MS.length) {
        const stats = fs.statSync(lockPath);
        if (Date.now() - stats.mtimeMs > LOCK_STALE_AFTER_MS) {
          fs.rmSync(lockPath, { force: true });
          console.warn('[soul][git-ops] removed stale index.lock', { lockPath });
          return;
        }
        throw new Error(`git index.lock still present for ${repoPath}`);
      }

      await sleep(LOCK_RETRY_DELAYS_MS[attempt]);
    }
  }
}
