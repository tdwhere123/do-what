import type Database from 'better-sqlite3';
import type { SoulDbMigration } from '../migration-runner.js';
import { TABLE_PROJECTS } from '../schema.js';

export const v2Migration: SoulDbMigration = {
  description: 'Add projects table for memory repository bindings',
  up(db: Database.Database): void {
    db.exec(`
      CREATE TABLE IF NOT EXISTS ${TABLE_PROJECTS} (
        project_id                TEXT PRIMARY KEY,
        primary_key               TEXT,
        secondary_key             TEXT NOT NULL,
        workspace_path            TEXT NOT NULL,
        fingerprint               TEXT NOT NULL,
        memory_repo_path          TEXT NOT NULL,
        created_at                TEXT NOT NULL,
        last_active_at            TEXT NOT NULL,
        bootstrapping_phase_days  INTEGER NOT NULL DEFAULT 7
      );

      CREATE UNIQUE INDEX IF NOT EXISTS idx_projects_fingerprint
        ON ${TABLE_PROJECTS}(fingerprint);
      CREATE INDEX IF NOT EXISTS idx_projects_primary_key
        ON ${TABLE_PROJECTS}(primary_key)
        WHERE primary_key IS NOT NULL;
      CREATE INDEX IF NOT EXISTS idx_projects_workspace_path
        ON ${TABLE_PROJECTS}(workspace_path);
    `);
  },
  version: 2,
};
