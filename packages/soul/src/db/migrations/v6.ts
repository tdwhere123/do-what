import type Database from 'better-sqlite3';
import type { SoulDbMigration } from '../migration-runner.js';
import { TABLE_MEMORY_CUES } from '../schema.js';

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

export const v6Migration: SoulDbMigration = {
  description: 'Activate Soul concept axis fields and checkpoint claim columns',
  up(db): void {
    addColumnIfMissing(db, TABLE_MEMORY_CUES, 'type TEXT', 'type');
    addColumnIfMissing(db, TABLE_MEMORY_CUES, 'snippet_excerpt TEXT', 'snippet_excerpt');
    addColumnIfMissing(db, TABLE_MEMORY_CUES, 'claim_draft TEXT', 'claim_draft');
    addColumnIfMissing(db, TABLE_MEMORY_CUES, 'claim_confidence REAL', 'claim_confidence');
    addColumnIfMissing(db, TABLE_MEMORY_CUES, 'claim_gist TEXT', 'claim_gist');
    addColumnIfMissing(db, TABLE_MEMORY_CUES, 'claim_source TEXT', 'claim_source');
    addColumnIfMissing(db, TABLE_MEMORY_CUES, 'pruned INTEGER NOT NULL DEFAULT 0', 'pruned');

    db.exec(`
      UPDATE ${TABLE_MEMORY_CUES}
      SET formation_kind = CASE COALESCE(type, 'fact')
        WHEN 'fact' THEN 'observation'
        WHEN 'pattern' THEN 'inference'
        WHEN 'decision' THEN 'interaction'
        WHEN 'risk' THEN 'synthesis'
        ELSE 'observation'
      END
      WHERE formation_kind IS NULL OR TRIM(formation_kind) = '';

      UPDATE ${TABLE_MEMORY_CUES}
      SET dimension = CASE COALESCE(type, 'fact')
        WHEN 'fact' THEN 'technical'
        WHEN 'pattern' THEN 'technical'
        WHEN 'decision' THEN 'behavioral'
        WHEN 'risk' THEN 'contextual'
        ELSE 'technical'
      END
      WHERE dimension IS NULL OR TRIM(dimension) = '';

      UPDATE ${TABLE_MEMORY_CUES}
      SET focus_surface = 'default'
      WHERE focus_surface IS NULL OR TRIM(focus_surface) = '';

      UPDATE ${TABLE_MEMORY_CUES}
      SET activation_score = COALESCE(activation_score, 0),
          retention_score = COALESCE(retention_score, 0.5),
          pruned = COALESCE(pruned, 0);
    `);
  },
  version: 6,
};
