import type Database from 'better-sqlite3';
import type { SoulDbMigration } from '../migration-runner.js';
import { TABLE_EVIDENCE_INDEX, TABLE_REFACTOR_EVENTS } from '../schema.js';

function hasColumn(
  db: Database.Database,
  tableName: string,
  columnName: string,
): boolean {
  const rows = db.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{
    name?: string;
  }>;
  return rows.some((row) => row.name === columnName);
}

function addColumnIfMissing(
  db: Database.Database,
  tableName: string,
  columnName: string,
  definition: string,
): void {
  if (hasColumn(db, tableName, columnName)) {
    return;
  }

  db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
}

export const v5Migration: SoulDbMigration = {
  description: 'Add refactor events and evidence relocation fields',
  up(db: Database.Database): void {
    db.exec(`
      CREATE TABLE IF NOT EXISTS ${TABLE_REFACTOR_EVENTS} (
        event_id     TEXT PRIMARY KEY,
        project_id   TEXT NOT NULL,
        commit_sha   TEXT NOT NULL,
        renames      TEXT NOT NULL,
        detected_at  TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_refactor_project
        ON ${TABLE_REFACTOR_EVENTS}(project_id, detected_at);
    `);

    addColumnIfMissing(db, TABLE_EVIDENCE_INDEX, 'relocation_status', 'TEXT');
    addColumnIfMissing(db, TABLE_EVIDENCE_INDEX, 'relocation_attempted_at', 'TEXT');
    addColumnIfMissing(db, TABLE_EVIDENCE_INDEX, 'relocated_pointer', 'TEXT');
  },
  version: 5,
};
