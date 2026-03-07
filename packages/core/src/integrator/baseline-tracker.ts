import { createReadConnection } from '../db/read-connection.js';
import { TABLE_DIAGNOSTICS_BASELINE } from '../db/schema.js';
import type { DbWriteRequest } from '../db/worker-client.js';

export interface DiagnosticsBaseline {
  createdAt: string;
  errorCount: number;
  updatedAt: string;
  workspaceId: string;
}

export interface BaselineEvaluation {
  afterErrorCount: number;
  baselineErrorCount: number;
  createdBaseline: boolean;
  delta: number;
  passed: boolean;
}

export interface BaselineTrackerOptions {
  dbPath: string;
  dbWriter: {
    write: (request: DbWriteRequest) => Promise<void>;
  };
  now?: () => string;
}

export class BaselineTracker {
  private readonly dbPath: string;
  private readonly dbWriter: BaselineTrackerOptions['dbWriter'];
  private readonly now: () => string;

  constructor(options: BaselineTrackerOptions) {
    this.dbPath = options.dbPath;
    this.dbWriter = options.dbWriter;
    this.now = options.now ?? (() => new Date().toISOString());
  }

  evaluate(workspaceId: string, afterErrorCount: number): BaselineEvaluation {
    const existing = this.get(workspaceId);
    if (!existing) {
      return {
        afterErrorCount,
        baselineErrorCount: afterErrorCount,
        createdBaseline: true,
        delta: 0,
        passed: true,
      };
    }

    return {
      afterErrorCount,
      baselineErrorCount: existing.errorCount,
      createdBaseline: false,
      delta: afterErrorCount - existing.errorCount,
      passed: afterErrorCount <= existing.errorCount,
    };
  }

  get(workspaceId: string): DiagnosticsBaseline | null {
    const db = createReadConnection(this.dbPath);
    try {
      const row = db
        .prepare(
          `SELECT workspace_id, error_count, created_at, updated_at
           FROM ${TABLE_DIAGNOSTICS_BASELINE}
           WHERE workspace_id = ?`,
        )
        .get(workspaceId) as
        | {
            created_at: string;
            error_count: number;
            updated_at: string;
            workspace_id: string;
          }
        | undefined;
      if (!row) {
        return null;
      }

      return {
        createdAt: row.created_at,
        errorCount: row.error_count,
        updatedAt: row.updated_at,
        workspaceId: row.workspace_id,
      };
    } finally {
      db.close();
    }
  }

  async update(workspaceId: string, errorCount: number): Promise<void> {
    const now = this.now();
    const existing = this.get(workspaceId);

    await this.dbWriter.write({
      params: [workspaceId, errorCount, existing?.createdAt ?? now, now],
      sql: `INSERT INTO ${TABLE_DIAGNOSTICS_BASELINE} (
              workspace_id,
              error_count,
              created_at,
              updated_at
            ) VALUES (?, ?, ?, ?)
            ON CONFLICT(workspace_id) DO UPDATE SET
              error_count = excluded.error_count,
              updated_at = excluded.updated_at`,
    });
  }
}
