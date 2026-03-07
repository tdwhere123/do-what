import { randomUUID } from 'node:crypto';
import {
  TABLE_REFACTOR_EVENTS,
  type RefactorEventRow,
} from '../db/schema.js';
import type { SoulStateStore } from '../db/soul-state-store.js';
import type { SoulWorkerClient } from '../db/worker-client.js';

export interface RenameRecord {
  new_path: string;
  old_path: string;
  similarity: number;
}

export interface RecordRefactorInput {
  commitSha?: string;
  diff: string;
  projectId: string;
}

export interface GitRenameDetectorOptions {
  stateStore: SoulStateStore;
  writer: SoulWorkerClient;
}

function parseRenames(diff: string): RenameRecord[] {
  const lines = diff.split(/\r?\n/);
  const renames: RenameRecord[] = [];
  let similarity = 100;
  let oldPath: string | null = null;

  for (const line of lines) {
    const similarityMatch = /^similarity index (\d+)%$/.exec(line.trim());
    if (similarityMatch) {
      similarity = Number.parseInt(similarityMatch[1] ?? '100', 10);
      continue;
    }

    if (line.startsWith('rename from ')) {
      oldPath = line.slice('rename from '.length).trim();
      continue;
    }

    if (line.startsWith('rename to ') && oldPath) {
      renames.push({
        new_path: line.slice('rename to '.length).trim(),
        old_path: oldPath,
        similarity,
      });
      oldPath = null;
      similarity = 100;
    }
  }

  return renames;
}

export class GitRenameDetector {
  private readonly stateStore: SoulStateStore;
  private readonly writer: SoulWorkerClient;

  constructor(options: GitRenameDetectorOptions) {
    this.stateStore = options.stateStore;
    this.writer = options.writer;
  }

  async recordFromDiff(input: RecordRefactorInput): Promise<void> {
    const renames = parseRenames(input.diff);
    if (renames.length === 0) {
      return;
    }

    const now = new Date().toISOString();
    try {
      await this.writer.write({
        params: [
          randomUUID(),
          input.projectId,
          input.commitSha ?? 'unknown',
          JSON.stringify(renames),
          now,
        ],
        sql: `INSERT INTO ${TABLE_REFACTOR_EVENTS} (
                event_id,
                project_id,
                commit_sha,
                renames,
                detected_at
              )
              VALUES (?, ?, ?, ?, ?)`,
      });
    } catch (error) {
      console.warn('[soul][rename-detector] failed to record refactor event', error);
    }
  }

  findLatestRename(projectId: string, oldPath: string): RenameRecord | null {
    return this.stateStore.read(
      (db) => {
        const rows = db
          .prepare(
            `SELECT renames
             FROM ${TABLE_REFACTOR_EVENTS}
             WHERE project_id = ?
             ORDER BY detected_at DESC`,
          )
          .all(projectId) as RefactorEventRow[];
        for (const row of rows) {
          const renames = JSON.parse(row.renames) as RenameRecord[];
          const match = renames.find((rename) => rename.old_path === oldPath);
          if (match) {
            return match;
          }
        }
        return null;
      },
      null,
    );
  }
}

export { parseRenames as parseRenameDiff };
