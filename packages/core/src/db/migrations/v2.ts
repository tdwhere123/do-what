import type Database from 'better-sqlite3';
import { TABLE_DIAGNOSTICS_BASELINE } from '../schema.js';
import type { DbMigration } from '../migration-runner.js';

export const v2Migration: DbMigration = {
  description: 'Add diagnostics baseline table',
  up(db: Database.Database): void {
    db.exec(`
      CREATE TABLE IF NOT EXISTS ${TABLE_DIAGNOSTICS_BASELINE} (
        workspace_id  TEXT PRIMARY KEY,
        error_count   INTEGER NOT NULL,
        created_at    TEXT NOT NULL,
        updated_at    TEXT NOT NULL
      );
    `);
  },
  version: 2,
};
