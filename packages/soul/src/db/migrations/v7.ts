import type Database from 'better-sqlite3';
import type { SoulDbMigration } from '../migration-runner.js';
import { TABLE_EVIDENCE_INDEX } from '../schema.js';

function hasColumn(
  db: Database.Database,
  table: string,
  columnName: string,
): boolean {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  return columns.some((column) => column.name === columnName);
}

function addColumnIfMissing(
  db: Database.Database,
  table: string,
  definition: string,
  columnName: string,
): void {
  if (hasColumn(db, table, columnName)) {
    return;
  }

  db.exec(`ALTER TABLE ${table} ADD COLUMN ${definition}`);
}

export const v7Migration: SoulDbMigration = {
  description: 'Add evidence capsule fields for canon claim checkpoints',
  up(db): void {
    addColumnIfMissing(db, TABLE_EVIDENCE_INDEX, 'git_commit TEXT', 'git_commit');
    addColumnIfMissing(db, TABLE_EVIDENCE_INDEX, 'repo_path TEXT', 'repo_path');
    addColumnIfMissing(db, TABLE_EVIDENCE_INDEX, 'symbol TEXT', 'symbol');
    addColumnIfMissing(db, TABLE_EVIDENCE_INDEX, 'snippet_excerpt TEXT', 'snippet_excerpt');
    addColumnIfMissing(db, TABLE_EVIDENCE_INDEX, 'context_fingerprint TEXT', 'context_fingerprint');
    addColumnIfMissing(db, TABLE_EVIDENCE_INDEX, 'confidence REAL NOT NULL DEFAULT 0', 'confidence');
    addColumnIfMissing(db, TABLE_EVIDENCE_INDEX, 'created_at TEXT', 'created_at');

    db.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_evidence_fingerprint
        ON ${TABLE_EVIDENCE_INDEX}(context_fingerprint);

      UPDATE ${TABLE_EVIDENCE_INDEX}
      SET created_at = COALESCE(created_at, last_accessed, CURRENT_TIMESTAMP)
      WHERE created_at IS NULL;
    `);
  },
  version: 7,
};
