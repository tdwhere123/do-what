import type Database from 'better-sqlite3';
import { TABLE_BASELINE_LOCKS } from '../schema.js';
import type { DbMigration } from '../migration-runner.js';

export const v3Migration: DbMigration = {
  description: 'Add baseline lock table',
  up(db: Database.Database): void {
    db.exec(`
      CREATE TABLE IF NOT EXISTS ${TABLE_BASELINE_LOCKS} (
        lock_id                TEXT PRIMARY KEY,
        run_id                 TEXT NOT NULL UNIQUE,
        surface_id             TEXT NOT NULL,
        workspace_id           TEXT NOT NULL,
        baseline_fingerprint   TEXT NOT NULL,
        locked_at              TEXT NOT NULL,
        files_snapshot         TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_baseline_locks_workspace
        ON ${TABLE_BASELINE_LOCKS}(workspace_id, locked_at);
    `);
  },
  version: 3,
};
