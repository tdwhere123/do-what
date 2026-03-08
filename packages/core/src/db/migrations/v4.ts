import type Database from 'better-sqlite3';
import { TABLE_GOVERNANCE_LEASES } from '../schema.js';
import type { DbMigration } from '../migration-runner.js';

export const v4Migration: DbMigration = {
  description: 'Add governance leases table',
  up(db: Database.Database): void {
    db.exec(`
      CREATE TABLE IF NOT EXISTS ${TABLE_GOVERNANCE_LEASES} (
        lease_id                 TEXT PRIMARY KEY,
        run_id                   TEXT NOT NULL UNIQUE,
        workspace_id             TEXT NOT NULL,
        surface_id               TEXT NOT NULL,
        valid_snapshot           TEXT NOT NULL,
        conflict_conclusions     TEXT NOT NULL,
        invalidation_conditions  TEXT NOT NULL,
        issued_at                TEXT NOT NULL,
        expires_at               TEXT NOT NULL,
        status                   TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_governance_leases_workspace
        ON ${TABLE_GOVERNANCE_LEASES}(workspace_id, status, issued_at);
    `);
  },
  version: 4,
};
