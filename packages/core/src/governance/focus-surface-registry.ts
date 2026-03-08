import type { BaselineLock, FocusSurface } from '@do-what/protocol';
import { createReadConnection } from '../db/read-connection.js';
import { TABLE_BASELINE_LOCKS } from '../db/schema.js';
import type { DbWriteRequest } from '../db/worker-client.js';
import { BaselineCalculator } from './baseline-calculator.js';

export interface FocusSurfaceRegistryOptions {
  baselineCalculator: BaselineCalculator;
  dbPath: string;
  dbWriter: {
    write: (request: DbWriteRequest) => Promise<void>;
  };
}

interface BaselineLockRow {
  baseline_fingerprint: string;
  files_snapshot: string;
  lock_id: string;
  locked_at: string;
  run_id: string;
  surface_id: string;
  workspace_id: string;
}

export class FocusSurfaceRegistry {
  private readonly baselineCalculator: BaselineCalculator;
  private readonly dbPath: string;
  private readonly dbWriter: FocusSurfaceRegistryOptions['dbWriter'];

  constructor(options: FocusSurfaceRegistryOptions) {
    this.baselineCalculator = options.baselineCalculator;
    this.dbPath = options.dbPath;
    this.dbWriter = options.dbWriter;
  }

  async register(runId: string, surface: FocusSurface): Promise<{
    lock: BaselineLock;
    surface: FocusSurface;
  }> {
    const lock = await this.baselineCalculator.computeBaselineLock(surface, runId);
    const nextSurface: FocusSurface = {
      ...surface,
      baseline_fingerprint: lock.baseline_fingerprint,
    };
    await this.dbWriter.write({
      params: [
        lock.lock_id,
        lock.run_id,
        lock.surface_id,
        lock.workspace_id,
        lock.baseline_fingerprint,
        lock.locked_at,
        JSON.stringify(lock.files_snapshot),
      ],
      sql: `INSERT INTO ${TABLE_BASELINE_LOCKS} (
              lock_id,
              run_id,
              surface_id,
              workspace_id,
              baseline_fingerprint,
              locked_at,
              files_snapshot
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(run_id) DO UPDATE SET
              lock_id = excluded.lock_id,
              surface_id = excluded.surface_id,
              workspace_id = excluded.workspace_id,
              baseline_fingerprint = excluded.baseline_fingerprint,
              locked_at = excluded.locked_at,
              files_snapshot = excluded.files_snapshot`,
    });
    return {
      lock,
      surface: nextSurface,
    };
  }

  getByRunId(runId: string): BaselineLock | null {
    const db = createReadConnection(this.dbPath);
    try {
      const row = db
        .prepare(
          `SELECT lock_id,
                  run_id,
                  surface_id,
                  workspace_id,
                  baseline_fingerprint,
                  locked_at,
                  files_snapshot
           FROM ${TABLE_BASELINE_LOCKS}
           WHERE run_id = ?`,
        )
        .get(runId) as BaselineLockRow | undefined;
      if (!row) {
        return null;
      }

      return {
        baseline_fingerprint: row.baseline_fingerprint,
        files_snapshot: JSON.parse(row.files_snapshot) as BaselineLock['files_snapshot'],
        lock_id: row.lock_id,
        locked_at: row.locked_at,
        run_id: row.run_id,
        surface_id: row.surface_id,
        workspace_id: row.workspace_id,
      };
    } catch (error) {
      console.warn('[core][focus-surface-registry] failed to read baseline lock', error);
      return null;
    } finally {
      db.close();
    }
  }
}
