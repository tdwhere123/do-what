import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { BaselineLock, FileSnapshot, FocusSurface } from '@do-what/protocol';
import type { GitRunner } from '@do-what/tools';
import { normalizeRepoPath, uniqueSortedPaths } from './path-utils.js';

const MAX_BASELINE_FILES = 1000;

export interface BaselineCalculatorOptions {
  gitRunner: GitRunner;
  now?: () => string;
  repoPath: string;
}

function hashSnapshots(snapshots: readonly FileSnapshot[]): string {
  const digest = createHash('sha256');
  for (const snapshot of snapshots) {
    digest.update(`${snapshot.path}:${snapshot.git_hash}\n`);
  }
  return digest.digest('hex');
}

export function diffFileSnapshots(
  previous: readonly FileSnapshot[],
  current: readonly FileSnapshot[],
): string[] {
  const previousMap = new Map(previous.map((snapshot) => [snapshot.path, snapshot.git_hash]));
  const currentMap = new Map(current.map((snapshot) => [snapshot.path, snapshot.git_hash]));
  const changedPaths = new Set<string>();

  for (const [filePath, gitHash] of previousMap.entries()) {
    if (!currentMap.has(filePath) || currentMap.get(filePath) !== gitHash) {
      changedPaths.add(filePath);
    }
  }

  for (const [filePath, gitHash] of currentMap.entries()) {
    if (!previousMap.has(filePath) || previousMap.get(filePath) !== gitHash) {
      changedPaths.add(filePath);
    }
  }

  return [...changedPaths].sort((left, right) => left.localeCompare(right));
}

export class BaselineCalculator {
  private readonly gitRunner: GitRunner;
  private readonly now: () => string;
  private readonly repoPath: string;

  constructor(options: BaselineCalculatorOptions) {
    this.gitRunner = options.gitRunner;
    this.now = options.now ?? (() => new Date().toISOString());
    this.repoPath = options.repoPath;
  }

  async computeBaselineLock(
    surface: FocusSurface,
    runId: string,
  ): Promise<BaselineLock> {
    const trackedPaths = await this.listTrackedPaths(surface.path_globs);
    const filesSnapshot = await this.snapshotFiles(trackedPaths.slice(0, MAX_BASELINE_FILES));
    return {
      baseline_fingerprint: hashSnapshots(filesSnapshot),
      files_snapshot: filesSnapshot,
      lock_id: randomUUID(),
      locked_at: this.now(),
      run_id: runId,
      surface_id: surface.surface_id,
      workspace_id: surface.workspace_id,
    };
  }

  private async listTrackedPaths(pathGlobs: readonly string[]): Promise<string[]> {
    const normalizedGlobs = uniqueSortedPaths(pathGlobs);
    if (normalizedGlobs.length === 0) {
      return [];
    }

    const result = await this.gitRunner(['ls-files', '--', ...normalizedGlobs], {
      cwd: this.repoPath,
    });
    return uniqueSortedPaths(
      result.stdout
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line.length > 0),
    );
  }

  private async snapshotFiles(paths: readonly string[]): Promise<FileSnapshot[]> {
    const snapshots: FileSnapshot[] = [];
    for (const filePath of paths) {
      const normalizedPath = normalizeRepoPath(filePath);
      const hashResult = await this.gitRunner(['hash-object', normalizedPath], {
        cwd: this.repoPath,
      });
      const absolutePath = path.join(this.repoPath, normalizedPath);
      const sizeBytes = fs.existsSync(absolutePath) ? fs.statSync(absolutePath).size : 0;
      snapshots.push({
        git_hash: hashResult.stdout.trim(),
        path: normalizedPath,
        size_bytes: sizeBytes,
      });
    }
    return snapshots;
  }
}
