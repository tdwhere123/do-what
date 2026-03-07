import type Database from 'better-sqlite3';
import type { SoulDbMigration } from '../migration-runner.js';
import { TABLE_MEMORY_PROPOSALS } from '../schema.js';

export const v3Migration: SoulDbMigration = {
  description: 'Add memory proposals table',
  up(db: Database.Database): void {
    db.exec(`
      CREATE TABLE IF NOT EXISTS ${TABLE_MEMORY_PROPOSALS} (
        proposal_id           TEXT PRIMARY KEY,
        project_id            TEXT NOT NULL,
        cue_draft             TEXT NOT NULL,
        edge_drafts           TEXT,
        confidence            REAL NOT NULL,
        impact_level          TEXT NOT NULL,
        requires_checkpoint   INTEGER NOT NULL DEFAULT 0,
        status                TEXT NOT NULL DEFAULT 'pending',
        proposed_at           TEXT NOT NULL,
        resolved_at           TEXT,
        resolver              TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_proposals_project
        ON ${TABLE_MEMORY_PROPOSALS}(project_id, status);
      CREATE INDEX IF NOT EXISTS idx_proposals_status
        ON ${TABLE_MEMORY_PROPOSALS}(status, proposed_at);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_edges_unique
        ON memory_graph_edges(source_id, target_id, relation);
    `);
  },
  version: 3,
};
