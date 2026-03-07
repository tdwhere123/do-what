import { WorktreeManager, runGit, type WorktreeAllocation } from '@do-what/tools';
import { createReadConnection } from '../db/read-connection.js';
import type { DbWriteRequest } from '../db/worker-client.js';
import { RUN_TERMINAL_STATES } from '../machines/run-machine.js';

export interface CompletedRunCandidate {
  completedAt: string;
  patch: string;
  runId: string;
  touchedPaths: readonly string[];
  workspaceId: string;
}

export interface WorktreeLifecycleOptions {
  dbPath: string;
  dbWriter: {
    write: (request: DbWriteRequest) => Promise<void>;
  };
  integrator?: {
    submit: (candidate: CompletedRunCandidate) => Promise<void> | void;
  };
  now?: () => string;
  repoPath: string;
  source?: string;
  worktreeManager?: WorktreeManager;
}

export interface WorktreeStatusChange {
  runId: string;
  status: string;
  workspaceId: string;
}

export interface RunWorktreeMetadata {
  branchName?: string;
  integrationStatus?: string;
  patch?: string;
  releasedAt?: string;
  terminalStatus?: string;
  touchedPaths?: readonly string[];
  worktreeMode?: string;
  worktreePath?: string;
}

export class WorktreeLifecycle {
  private readonly allocations = new Map<string, Promise<WorktreeAllocation>>();
  private readonly dbPath: string;
  private readonly dbWriter: WorktreeLifecycleOptions['dbWriter'];
  private readonly integrator?: WorktreeLifecycleOptions['integrator'];
  private readonly metadata = new Map<string, RunWorktreeMetadata>();
  private readonly now: () => string;
  private readonly repoPath: string;
  private readonly source: string;
  private readonly worktreeManager: WorktreeManager;

  constructor(options: WorktreeLifecycleOptions) {
    this.dbPath = options.dbPath;
    this.dbWriter = options.dbWriter;
    this.integrator = options.integrator;
    this.now = options.now ?? (() => new Date().toISOString());
    this.repoPath = options.repoPath;
    this.source = options.source ?? 'core.worktree-lifecycle';
    this.worktreeManager = options.worktreeManager ?? new WorktreeManager();
  }

  async cleanupOrphans(activeRunIds: Iterable<string>): Promise<string[]> {
    return this.worktreeManager.cleanupOrphans(this.repoPath, activeRunIds);
  }

  getWorktreePath(runId: string): string | undefined {
    return this.metadata.get(runId)?.worktreePath;
  }

  async ensureAllocated(input: {
    runId: string;
    workspaceId: string;
  }): Promise<WorktreeAllocation> {
    const existing = this.allocations.get(input.runId);
    if (existing) {
      return existing;
    }

    const allocationPromise = this.worktreeManager
      .allocate(this.repoPath, input.runId)
      .then(async (allocation: WorktreeAllocation) => {
        const nextMetadata: RunWorktreeMetadata = {
          ...this.metadata.get(input.runId),
          branchName: allocation.branchName,
          worktreeMode: allocation.mode,
          worktreePath: allocation.worktreePath,
        };
        this.metadata.set(input.runId, nextMetadata);
        await this.persistMetadata(input.runId, nextMetadata);
        return allocation;
      })
      .catch((error: unknown) => {
        this.allocations.delete(input.runId);
        throw error;
      });

    this.allocations.set(input.runId, allocationPromise);
    return allocationPromise;
  }

  async handleStatusChange(change: WorktreeStatusChange): Promise<void> {
    if (
      change.status === 'started'
      || change.status === 'running'
      || change.status === 'waiting_approval'
    ) {
      await this.ensureAllocated(change);
      return;
    }

    if (!RUN_TERMINAL_STATES.includes(change.status as (typeof RUN_TERMINAL_STATES)[number])) {
      return;
    }

    await this.capturePatchAndRelease(change);
  }

  async setIntegrationStatus(runId: string, integrationStatus: string): Promise<void> {
    const nextMetadata: RunWorktreeMetadata = {
      ...this.loadPersistedMetadata(runId),
      ...this.metadata.get(runId),
      integrationStatus,
    };
    this.metadata.set(runId, nextMetadata);
    await this.persistMetadata(runId, nextMetadata);
  }

  private async capturePatchAndRelease(change: WorktreeStatusChange): Promise<void> {
    const allocationPromise = this.allocations.get(change.runId);
    const allocation = allocationPromise
      ? await allocationPromise.catch(() => undefined)
      : this.worktreeManager.getAllocation(change.runId);
    if (!allocation) {
      return;
    }

    let patch = '';
    let touchedPaths: string[] = [];

    try {
      await runGit(['add', '--intent-to-add', '--all'], {
        cwd: allocation.worktreePath,
      });
      patch = (await runGit(['diff', 'HEAD'], { cwd: allocation.worktreePath })).stdout;
      const touchedPathsResult = await runGit(['diff', '--name-only', 'HEAD'], {
        cwd: allocation.worktreePath,
      });
      touchedPaths = touchedPathsResult.stdout
        .split(/\r?\n/)
        .map((line: string) => line.trim())
        .filter((line: string) => line.length > 0);
    } catch (error) {
      console.warn(
        `[core][worktree-lifecycle] failed to capture patch for ${change.runId}`,
        error,
      );
    }

    const completedAt = this.now();
    const nextMetadata: RunWorktreeMetadata = {
      ...this.loadPersistedMetadata(change.runId),
      ...this.metadata.get(change.runId),
      patch,
      releasedAt: completedAt,
      terminalStatus: change.status,
      touchedPaths,
    };
    this.metadata.set(change.runId, nextMetadata);
    await this.persistMetadata(change.runId, nextMetadata);

    try {
      await this.worktreeManager.release(change.runId);
    } catch (error) {
      console.warn(
        `[core][worktree-lifecycle] failed to release worktree for ${change.runId}`,
        error,
      );
    } finally {
      this.allocations.delete(change.runId);
    }

    if (change.status === 'completed' && this.integrator) {
      await this.integrator.submit({
        completedAt,
        patch,
        runId: change.runId,
        touchedPaths,
        workspaceId: change.workspaceId,
      });
    }
  }

  private loadPersistedMetadata(runId: string): RunWorktreeMetadata {
    const db = createReadConnection(this.dbPath);
    try {
      const row = db
        .prepare('SELECT metadata FROM runs WHERE run_id = ?')
        .get(runId) as { metadata: string | null } | undefined;
      if (!row?.metadata) {
        return {};
      }

      return JSON.parse(row.metadata) as RunWorktreeMetadata;
    } catch (error) {
      console.warn('[core][worktree-lifecycle] failed to read run metadata', error);
      return {};
    } finally {
      db.close();
    }
  }

  private async persistMetadata(runId: string, metadata: RunWorktreeMetadata): Promise<void> {
    await this.dbWriter.write({
      params: [JSON.stringify(metadata), this.now(), runId],
      sql: `UPDATE runs
            SET metadata = ?, updated_at = ?
            WHERE run_id = ?`,
    });
  }
}
