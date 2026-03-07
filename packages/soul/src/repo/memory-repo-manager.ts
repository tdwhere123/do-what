import fs from 'node:fs';
import path from 'node:path';
import { MEMORY_REPO_BASE_PATH, ensureSoulRuntimeDirs } from '../config.js';
import type { SoulStateStore } from '../db/soul-state-store.js';
import {
  TABLE_PROJECTS,
  type ProjectRow,
} from '../db/schema.js';
import type { SoulWorkerClient } from '../db/worker-client.js';
import { createWorkspaceMemoryJunction } from './junction-creator.js';
import { runProcess } from './git-process.js';
import { GitOpsQueue } from './git-ops-queue.js';
import { describeFingerprint } from './project-fingerprint.js';

const DEFAULT_BOOTSTRAPPING_PHASE_DAYS = 7;
const MEMORY_AUTHOR_EMAIL = 'soul@do-what.local';
const MEMORY_AUTHOR_NAME = 'do-what';
const INITIAL_COMMIT_MESSAGE = 'chore(memory): initialize repository';

export interface MemoryRepoCommitFile {
  content: string;
  path: string;
}

export interface ProjectBinding {
  fingerprint: string;
  memoryRepoPath: string;
  projectId: string;
  workspacePath: string;
}

export interface MemoryRepoManagerOptions {
  gitOpsQueue?: GitOpsQueue;
  memoryRepoBasePath?: string;
  stateStore: SoulStateStore;
  workspaceRoot: string;
  writer: SoulWorkerClient;
}

interface GitResult {
  code: number;
  stderr: string;
  stdout: string;
}

export class MemoryRepoManager {
  private readonly backgroundTasks = new Set<Promise<void>>();
  private closed = false;
  private readonly gitOpsQueue: GitOpsQueue;
  private readonly memoryRepoBasePath: string;
  private readonly stateStore: SoulStateStore;
  private readonly workspaceRoot: string;
  private readonly writer: SoulWorkerClient;

  constructor(options: MemoryRepoManagerOptions) {
    this.gitOpsQueue = options.gitOpsQueue ?? new GitOpsQueue();
    this.memoryRepoBasePath = options.memoryRepoBasePath ?? MEMORY_REPO_BASE_PATH;
    this.stateStore = options.stateStore;
    this.workspaceRoot = options.workspaceRoot;
    this.writer = options.writer;
    ensureSoulRuntimeDirs({
      memoryRepoBasePath: this.memoryRepoBasePath,
    });
  }

  async ensureProject(projectId: string): Promise<ProjectBinding> {
    const existing = this.getProject(projectId);
    if (existing) {
      const memoryRepoPath = await this.getOrInit(existing.fingerprint);
      await this.refreshExistingProject(existing.project_id, existing.primary_key, existing.secondary_key, memoryRepoPath);
      await createWorkspaceMemoryJunction(this.workspaceRoot, memoryRepoPath);
      return {
        fingerprint: existing.fingerprint,
        memoryRepoPath,
        projectId: existing.project_id,
        workspacePath: this.workspaceRoot,
      };
    }

    const fingerprint = await describeFingerprint(this.workspaceRoot);
    const memoryRepoPath = await this.getOrInit(fingerprint.fingerprint);
    await this.upsertProject(projectId, fingerprint.primaryKey, fingerprint.secondaryKey, memoryRepoPath);
    await createWorkspaceMemoryJunction(this.workspaceRoot, memoryRepoPath);
    return {
      fingerprint: fingerprint.fingerprint,
      memoryRepoPath,
      projectId,
      workspacePath: this.workspaceRoot,
    };
  }

  async getOrInit(fingerprint: string): Promise<string> {
    const repoPath = path.join(this.memoryRepoBasePath, fingerprint, 'memory_repo');
    await this.gitOpsQueue.enqueue(repoPath, async () => {
      fs.mkdirSync(repoPath, { recursive: true });
      if (!(await this.isGitRepository(repoPath))) {
        await this.initializeRepository(repoPath);
      } else if (!(await this.hasHeadCommit(repoPath))) {
        await this.createInitialCommit(repoPath);
      }
    });
    return repoPath;
  }

  async commit(
    repoPath: string,
    message: string,
    files: readonly MemoryRepoCommitFile[],
  ): Promise<string> {
    return this.gitOpsQueue.enqueue(repoPath, async () => {
      for (const file of files) {
        const absolutePath = path.join(repoPath, file.path);
        fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
        fs.writeFileSync(absolutePath, file.content, 'utf8');
      }

      await this.runGit(repoPath, ['add', '--', ...files.map((file) => file.path)]);
      if (!(await this.hasStagedChanges(repoPath, files.map((file) => file.path)))) {
        return this.getCommitSha(repoPath);
      }

      await this.runGit(repoPath, ['commit', '-m', message]);
      const commitSha = await this.getCommitSha(repoPath);
      this.gc(repoPath);
      return commitSha;
    });
  }

  async getCommitSha(repoPath: string, ref = 'HEAD'): Promise<string> {
    const result = await this.runGit(repoPath, ['rev-parse', ref]);
    return result.stdout;
  }

  gc(repoPath: string): void {
    if (this.closed) {
      return;
    }

    let task: Promise<void>;
    task = new Promise<void>((resolve) => {
      setImmediate(resolve);
    })
      .then(async () => {
        if (!fs.existsSync(path.join(repoPath, '.git'))) {
          return;
        }

        const result = await this.gitOpsQueue.enqueue(repoPath, async () =>
          this.runGit(repoPath, ['gc', '--auto'], true),
        );
        if (result.code !== 0) {
          console.warn('[soul][memory-repo] git gc --auto failed', {
            repoPath,
            stderr: result.stderr,
          });
        }
      })
      .finally(() => {
        this.backgroundTasks.delete(task);
      });
    this.backgroundTasks.add(task);
  }

  async close(): Promise<void> {
    this.closed = true;
    await Promise.allSettled([...this.backgroundTasks]);
  }

  private getProject(projectId: string): ProjectRow | null {
    return this.stateStore.read(
      (db) =>
        (db
          .prepare(
            `SELECT
               project_id,
               primary_key,
               secondary_key,
               workspace_path,
               fingerprint,
               memory_repo_path,
               created_at,
               last_active_at,
               bootstrapping_phase_days
             FROM ${TABLE_PROJECTS}
             WHERE project_id = ?`,
          )
          .get(projectId) as ProjectRow | undefined) ?? null,
      null,
    );
  }

  private async hasHeadCommit(repoPath: string): Promise<boolean> {
    const result = await this.runGit(repoPath, ['rev-parse', '--verify', 'HEAD'], true);
    return result.code === 0;
  }

  private async hasStagedChanges(
    repoPath: string,
    relativePaths: readonly string[],
  ): Promise<boolean> {
    const result = await this.runGit(
      repoPath,
      ['status', '--short', '--', ...relativePaths],
      true,
    );
    return result.stdout.length > 0;
  }

  private async initializeRepository(repoPath: string): Promise<void> {
    await this.runGit(repoPath, ['init', '--initial-branch=main']);
    await this.configureAuthor(repoPath);
    await this.createInitialCommit(repoPath);
  }

  private async createInitialCommit(repoPath: string): Promise<void> {
    const readmePath = path.join(repoPath, 'README.md');
    if (!fs.existsSync(readmePath)) {
      fs.writeFileSync(
        readmePath,
        '# do-what memory repository\n\nThis repository stores persistent Soul memory artifacts.\n',
        'utf8',
      );
    }
    await this.runGit(repoPath, ['add', '--', 'README.md']);
    if (!(await this.hasStagedChanges(repoPath, ['README.md']))) {
      return;
    }
    await this.runGit(repoPath, ['commit', '-m', INITIAL_COMMIT_MESSAGE]);
  }

  private async configureAuthor(repoPath: string): Promise<void> {
    await this.runGit(repoPath, ['config', 'user.name', MEMORY_AUTHOR_NAME]);
    await this.runGit(repoPath, ['config', 'user.email', MEMORY_AUTHOR_EMAIL]);
  }

  private async isGitRepository(repoPath: string): Promise<boolean> {
    const result = await this.runGit(repoPath, ['rev-parse', '--is-inside-work-tree'], true);
    return result.code === 0 && result.stdout === 'true';
  }

  private async runGit(
    repoPath: string,
    args: readonly string[],
    allowFailure = false,
  ): Promise<GitResult> {
    const result = await runProcess({
      args,
      command: 'git',
      cwd: repoPath,
    });
    if (!allowFailure && result.code !== 0) {
      throw new Error(
        `git ${args.join(' ')} failed for ${repoPath}: ${result.stderr || result.stdout}`,
      );
    }
    return result;
  }

  private async refreshExistingProject(
    projectId: string,
    primaryKey: string | null,
    secondaryKey: string,
    memoryRepoPath: string,
  ): Promise<void> {
    const now = new Date().toISOString();
    await this.writer.write({
      params: [
        primaryKey,
        secondaryKey,
        this.workspaceRoot,
        memoryRepoPath,
        now,
        projectId,
      ],
      sql: `UPDATE ${TABLE_PROJECTS}
            SET primary_key = ?,
                secondary_key = ?,
                workspace_path = ?,
                memory_repo_path = ?,
                last_active_at = ?
            WHERE project_id = ?`,
    });
  }

  private async upsertProject(
    projectId: string,
    primaryKey: string | null,
    secondaryKey: string,
    memoryRepoPath: string,
  ): Promise<void> {
    const now = new Date().toISOString();
    await this.writer.write({
      params: [
        projectId,
        primaryKey,
        secondaryKey,
        this.workspaceRoot,
        path.basename(path.dirname(memoryRepoPath)),
        memoryRepoPath,
        now,
        now,
        DEFAULT_BOOTSTRAPPING_PHASE_DAYS,
      ],
      sql: `INSERT INTO ${TABLE_PROJECTS} (
              project_id,
              primary_key,
              secondary_key,
              workspace_path,
              fingerprint,
              memory_repo_path,
              created_at,
              last_active_at,
              bootstrapping_phase_days
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(project_id) DO UPDATE SET
              primary_key = excluded.primary_key,
              secondary_key = excluded.secondary_key,
              workspace_path = excluded.workspace_path,
              fingerprint = excluded.fingerprint,
              memory_repo_path = excluded.memory_repo_path,
              last_active_at = excluded.last_active_at,
              bootstrapping_phase_days = excluded.bootstrapping_phase_days`,
    });
  }
}
