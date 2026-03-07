import fs from 'node:fs';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { GitCommandError } from './git-process.js';

const DEFAULT_MAX_LOCK_RETRIES = 5;
const DEFAULT_LOCK_RETRY_BASE_MS = 100;
const DEFAULT_LOCK_RETRY_JITTER_MS = 50;
const DEFAULT_STALE_LOCK_MS = 60_000;

export class GitLockError extends Error {
  readonly repoPath: string;

  constructor(repoPath: string, message: string, cause?: unknown) {
    super(message, cause !== undefined ? { cause } : undefined);
    this.name = 'GitLockError';
    this.repoPath = repoPath;
  }
}

export interface GitOpsQueueLogger {
  warn: (details: Record<string, unknown>, message: string) => void;
}

export interface GitOpsQueueOptions {
  jitterMs?: number;
  lockRetryBaseMs?: number;
  logger?: GitOpsQueueLogger;
  maxLockRetries?: number;
  random?: () => number;
  sleep?: (ms: number) => Promise<void>;
  staleLockMs?: number;
}

function isIndexLockError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const candidates = [
    error.message,
    error instanceof GitCommandError ? error.stderr : '',
    error instanceof GitCommandError ? error.stdout : '',
  ];

  return candidates.some((candidate) =>
    candidate.includes('index.lock') && candidate.match(/EEXIST|File exists|Unable to create/i),
  );
}

function resolveGitDir(repoPath: string): string | null {
  const dotGitPath = path.join(repoPath, '.git');
  if (!fs.existsSync(dotGitPath)) {
    return null;
  }

  const stats = fs.statSync(dotGitPath);
  if (stats.isDirectory()) {
    return dotGitPath;
  }

  const content = fs.readFileSync(dotGitPath, 'utf8').trim();
  if (!content.startsWith('gitdir:')) {
    return null;
  }

  const gitDir = content.slice('gitdir:'.length).trim();
  return path.resolve(repoPath, gitDir);
}

export class GitOpsQueue {
  private readonly jitterMs: number;
  private readonly lockRetryBaseMs: number;
  private readonly logger?: GitOpsQueueLogger;
  private readonly maxLockRetries: number;
  private readonly random: () => number;
  private readonly sleepFn: (ms: number) => Promise<void>;
  private readonly staleLockMs: number;
  private readonly tails = new Map<string, Promise<void>>();

  constructor(options: GitOpsQueueOptions = {}) {
    this.jitterMs = options.jitterMs ?? DEFAULT_LOCK_RETRY_JITTER_MS;
    this.lockRetryBaseMs = options.lockRetryBaseMs ?? DEFAULT_LOCK_RETRY_BASE_MS;
    this.logger = options.logger;
    this.maxLockRetries = options.maxLockRetries ?? DEFAULT_MAX_LOCK_RETRIES;
    this.random = options.random ?? Math.random;
    this.sleepFn = options.sleep ?? sleep;
    this.staleLockMs = options.staleLockMs ?? DEFAULT_STALE_LOCK_MS;
  }

  async enqueue<T>(repoPath: string, operation: () => Promise<T>): Promise<T> {
    const normalizedRepoPath = path.resolve(repoPath);
    const previous = this.tails.get(normalizedRepoPath) ?? Promise.resolve();
    const runPromise = previous.catch(() => undefined).then(() =>
      this.runWithLockRetries(normalizedRepoPath, operation),
    );
    const queuedTail = runPromise.then(() => undefined, () => undefined);
    this.tails.set(normalizedRepoPath, queuedTail);

    try {
      return await runPromise;
    } finally {
      if (this.tails.get(normalizedRepoPath) === queuedTail) {
        this.tails.delete(normalizedRepoPath);
      }
    }
  }

  private async runWithLockRetries<T>(
    repoPath: string,
    operation: () => Promise<T>,
  ): Promise<T> {
    let lastError: unknown;

    for (let attempt = 0; attempt < this.maxLockRetries; attempt += 1) {
      try {
        return await operation();
      } catch (error) {
        if (!isIndexLockError(error)) {
          throw error;
        }

        lastError = error;
        if (attempt === this.maxLockRetries - 1) {
          break;
        }

        const backoff = this.lockRetryBaseMs * 2 ** attempt;
        const jitter = Math.round((this.random() * 2 - 1) * this.jitterMs);
        await this.sleepFn(Math.max(0, backoff + jitter));
      }
    }

    const indexLockPath = this.resolveIndexLockPath(repoPath);
    if (indexLockPath && this.isStaleLock(indexLockPath)) {
      this.logger?.warn(
        {
          indexLockPath,
          repoPath,
        },
        'removing stale git index.lock after retry exhaustion',
      );
      fs.rmSync(indexLockPath, { force: true });

      try {
        return await operation();
      } catch (error) {
        throw new GitLockError(
          repoPath,
          `git operation failed after removing stale index.lock for ${repoPath}`,
          error,
        );
      }
    }

    throw new GitLockError(
      repoPath,
      `git operation failed because index.lock remained busy for ${repoPath}`,
      lastError,
    );
  }

  private isStaleLock(indexLockPath: string): boolean {
    try {
      const stats = fs.statSync(indexLockPath);
      return Date.now() - stats.mtimeMs >= this.staleLockMs;
    } catch {
      return false;
    }
  }

  private resolveIndexLockPath(repoPath: string): string | null {
    const gitDir = resolveGitDir(repoPath);
    if (!gitDir) {
      return null;
    }

    return path.join(gitDir, 'index.lock');
  }
}
