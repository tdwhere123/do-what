import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { GitOpsQueue } from './gitops-queue.js';
import { GitCommandError, runGit, type GitRunner } from './git-process.js';

export interface WorktreeAllocation {
  branchName: string;
  mode: 'worktree';
  repoPath: string;
  runId: string;
  worktreePath: string;
}

export interface WorktreeEntry {
  branchName?: string;
  head?: string;
  worktreePath: string;
}

export interface WorktreeManagerOptions {
  baseDir?: string;
  gitQueue?: GitOpsQueue;
  gitRunner?: GitRunner;
}

function isMissingBranchError(error: unknown): boolean {
  if (!(error instanceof GitCommandError)) {
    return false;
  }

  const output = `${error.stdout}\n${error.stderr}`;
  return /branch '.+' not found|not a valid branch name/i.test(output);
}

function sanitizeRunId(runId: string): string {
  const normalized = runId.replace(/[^a-zA-Z0-9_-]/g, '-');
  return normalized.length > 0 ? normalized : 'run';
}

function buildBranchName(runId: string): string {
  return `wt-${sanitizeRunId(runId).slice(0, 8)}`;
}

function parseWorktreeList(output: string): WorktreeEntry[] {
  const blocks = output
    .trim()
    .split(/\r?\n\r?\n/)
    .filter((block) => block.trim().length > 0);

  return blocks.map((block) => {
    const entry: WorktreeEntry = { worktreePath: '' };
    for (const line of block.split(/\r?\n/)) {
      const [key, ...rest] = line.split(' ');
      const value = rest.join(' ').trim();
      if (key === 'worktree') {
        entry.worktreePath = path.resolve(value);
      } else if (key === 'HEAD') {
        entry.head = value;
      } else if (key === 'branch') {
        entry.branchName = value.replace(/^refs\/heads\//, '');
      }
    }
    return entry;
  });
}

export class WorktreeManager {
  private readonly allocations = new Map<string, WorktreeAllocation>();
  private readonly baseDir: string;
  private readonly gitQueue: GitOpsQueue;
  private readonly gitRunner: GitRunner;

  constructor(options: WorktreeManagerOptions = {}) {
    this.baseDir =
      path.resolve(options.baseDir ?? path.join(os.homedir(), '.do-what', 'worktrees'));
    this.gitQueue = options.gitQueue ?? new GitOpsQueue();
    this.gitRunner = options.gitRunner ?? runGit;
  }

  async allocate(repoPath: string, runId: string): Promise<WorktreeAllocation> {
    const existing = this.allocations.get(runId);
    if (existing) {
      return existing;
    }

    const normalizedRepoPath = path.resolve(repoPath);
    const worktreePath = path.join(this.baseDir, sanitizeRunId(runId));
    const branchName = buildBranchName(runId);

    fs.mkdirSync(this.baseDir, { recursive: true });

    const allocation = await this.gitQueue.enqueue(normalizedRepoPath, async () => {
      if (fs.existsSync(worktreePath)) {
        fs.rmSync(worktreePath, { force: true, recursive: true });
      }

      try {
        await this.gitRunner(['branch', '-D', branchName], {
          cwd: normalizedRepoPath,
        });
      } catch (error) {
        if (!isMissingBranchError(error)) {
          throw error;
        }
      }

      await this.gitRunner(['worktree', 'add', '-b', branchName, worktreePath], {
        cwd: normalizedRepoPath,
      });

      return {
        branchName,
        mode: 'worktree' as const,
        repoPath: normalizedRepoPath,
        runId,
        worktreePath,
      };
    });

    this.allocations.set(runId, allocation);
    return allocation;
  }

  getAllocation(runId: string): WorktreeAllocation | undefined {
    return this.allocations.get(runId);
  }

  async list(repoPath: string): Promise<WorktreeEntry[]> {
    const result = await this.gitRunner(['worktree', 'list', '--porcelain'], {
      cwd: path.resolve(repoPath),
    });
    return parseWorktreeList(result.stdout);
  }

  async release(runId: string): Promise<void> {
    const allocation = this.allocations.get(runId);
    if (!allocation) {
      return;
    }

    await this.gitQueue.enqueue(allocation.repoPath, async () => {
      try {
        await this.gitRunner(
          ['worktree', 'remove', allocation.worktreePath, '--force'],
          {
            cwd: allocation.repoPath,
          },
        );
      } finally {
        if (fs.existsSync(allocation.worktreePath)) {
          fs.rmSync(allocation.worktreePath, { force: true, recursive: true });
        }
      }

      try {
        await this.gitRunner(['branch', '-D', allocation.branchName], {
          cwd: allocation.repoPath,
        });
      } catch (error) {
        if (!isMissingBranchError(error)) {
          throw error;
        }
      }
    });

    this.allocations.delete(runId);
  }

  async cleanupOrphans(repoPath: string, activeRunIds: Iterable<string>): Promise<string[]> {
    const active = new Set(activeRunIds);
    const entries = await this.list(repoPath);
    const removed: string[] = [];

    for (const entry of entries) {
      const runId = path.basename(entry.worktreePath);
      if (!entry.worktreePath.startsWith(this.baseDir) || active.has(runId)) {
        continue;
      }

      this.allocations.set(runId, {
        branchName: entry.branchName ?? buildBranchName(runId),
        mode: 'worktree',
        repoPath: path.resolve(repoPath),
        runId,
        worktreePath: entry.worktreePath,
      });
      await this.release(runId);
      removed.push(runId);
    }

    return removed;
  }
}
