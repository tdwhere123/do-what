import type Database from 'better-sqlite3';
import type { SoulDbMigration } from '../migration-runner.js';
import {
  TABLE_EVIDENCE_INDEX,
  TABLE_MEMORY_CUES,
  TABLE_MEMORY_CUES_FTS,
  TABLE_MEMORY_GRAPH_EDGES,
} from '../schema.js';

function createFtsResources(db: Database.Database): void {
  try {
    db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS ${TABLE_MEMORY_CUES_FTS} USING fts5(
        gist,
        anchors,
        content=${TABLE_MEMORY_CUES},
        content_rowid=rowid
      );

      CREATE TRIGGER IF NOT EXISTS cue_ai AFTER INSERT ON ${TABLE_MEMORY_CUES} BEGIN
        INSERT INTO ${TABLE_MEMORY_CUES_FTS}(rowid, gist, anchors)
        VALUES (new.rowid, new.gist, new.anchors);
      END;

      CREATE TRIGGER IF NOT EXISTS cue_ad AFTER DELETE ON ${TABLE_MEMORY_CUES} BEGIN
        INSERT INTO ${TABLE_MEMORY_CUES_FTS}(${TABLE_MEMORY_CUES_FTS}, rowid, gist, anchors)
        VALUES ('delete', old.rowid, old.gist, old.anchors);
      END;

      CREATE TRIGGER IF NOT EXISTS cue_au AFTER UPDATE ON ${TABLE_MEMORY_CUES} BEGIN
        INSERT INTO ${TABLE_MEMORY_CUES_FTS}(${TABLE_MEMORY_CUES_FTS}, rowid, gist, anchors)
        VALUES ('delete', old.rowid, old.gist, old.anchors);
        INSERT INTO ${TABLE_MEMORY_CUES_FTS}(rowid, gist, anchors)
        VALUES (new.rowid, new.gist, new.anchors);
      END;
    `);
  } catch (error) {
    console.warn('[soul][migration:v1] FTS5 unavailable, continuing without it', error);
  }
}

export const v1Migration: SoulDbMigration = {
  description: 'Initial Soul schema',
  up(db: Database.Database): void {
    db.exec(`
      CREATE TABLE IF NOT EXISTS ${TABLE_MEMORY_CUES} (
        cue_id                TEXT PRIMARY KEY,
        project_id            TEXT,
        gist                  TEXT NOT NULL,
        summary               TEXT,
        source                TEXT NOT NULL DEFAULT 'compiler',
        formation_kind        TEXT,
        dimension             TEXT,
        scope                 TEXT DEFAULT 'project',
        domain_tags           TEXT,
        impact_level          TEXT NOT NULL DEFAULT 'working',
        track                 TEXT,
        anchors               TEXT NOT NULL,
        pointers              TEXT NOT NULL,
        evidence_refs         TEXT,
        focus_surface         TEXT,
        activation_score      REAL DEFAULT 0.0,
        retention_score       REAL DEFAULT 0.5,
        manifestation_state   TEXT DEFAULT 'hidden',
        retention_state       TEXT DEFAULT 'working',
        decay_profile         TEXT DEFAULT 'normal',
        confidence            REAL NOT NULL DEFAULT 0.5,
        created_at            TEXT NOT NULL,
        updated_at            TEXT NOT NULL,
        last_used_at          TEXT,
        last_hit_at           TEXT,
        hit_count             INTEGER NOT NULL DEFAULT 0,
        reinforcement_count   INTEGER DEFAULT 0,
        contradiction_count   INTEGER DEFAULT 0,
        superseded_by         TEXT,
        claim_namespace       TEXT,
        claim_key             TEXT,
        claim_value           TEXT,
        claim_scope           TEXT,
        claim_mode            TEXT,
        claim_strength        REAL,
        metadata              TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_cues_project
        ON ${TABLE_MEMORY_CUES}(project_id, impact_level);
      CREATE INDEX IF NOT EXISTS idx_cues_track
        ON ${TABLE_MEMORY_CUES}(project_id, track);
      CREATE INDEX IF NOT EXISTS idx_cues_scope
        ON ${TABLE_MEMORY_CUES}(scope, project_id);
      CREATE INDEX IF NOT EXISTS idx_cues_dimension
        ON ${TABLE_MEMORY_CUES}(dimension, project_id);
      CREATE INDEX IF NOT EXISTS idx_cues_claim_key
        ON ${TABLE_MEMORY_CUES}(claim_key)
        WHERE claim_key IS NOT NULL;
      CREATE INDEX IF NOT EXISTS idx_cues_retention
        ON ${TABLE_MEMORY_CUES}(retention_state, retention_score);
      CREATE INDEX IF NOT EXISTS idx_cues_activation
        ON ${TABLE_MEMORY_CUES}(manifestation_state, activation_score DESC);

      CREATE TABLE IF NOT EXISTS ${TABLE_MEMORY_GRAPH_EDGES} (
        edge_id      TEXT PRIMARY KEY,
        source_id    TEXT NOT NULL,
        target_id    TEXT NOT NULL,
        relation     TEXT NOT NULL,
        track        TEXT,
        confidence   REAL NOT NULL DEFAULT 0.5,
        evidence     TEXT,
        created_at   TEXT NOT NULL,
        FOREIGN KEY(source_id) REFERENCES ${TABLE_MEMORY_CUES}(cue_id),
        FOREIGN KEY(target_id) REFERENCES ${TABLE_MEMORY_CUES}(cue_id)
      );

      CREATE INDEX IF NOT EXISTS idx_edges_source
        ON ${TABLE_MEMORY_GRAPH_EDGES}(source_id);
      CREATE INDEX IF NOT EXISTS idx_edges_target
        ON ${TABLE_MEMORY_GRAPH_EDGES}(target_id);

      CREATE TABLE IF NOT EXISTS ${TABLE_EVIDENCE_INDEX} (
        evidence_id    TEXT PRIMARY KEY,
        cue_id         TEXT NOT NULL,
        pointer        TEXT NOT NULL,
        pointer_key    TEXT NOT NULL UNIQUE,
        level          TEXT NOT NULL DEFAULT 'hint',
        content_hash   TEXT,
        embedding      BLOB,
        last_accessed  TEXT,
        access_count   INTEGER NOT NULL DEFAULT 0,
        FOREIGN KEY(cue_id) REFERENCES ${TABLE_MEMORY_CUES}(cue_id)
      );

      CREATE INDEX IF NOT EXISTS idx_evidence_cue
        ON ${TABLE_EVIDENCE_INDEX}(cue_id);
      CREATE INDEX IF NOT EXISTS idx_evidence_pointer_key
        ON ${TABLE_EVIDENCE_INDEX}(pointer_key);
    `);

    createFtsResources(db);
  },
  version: 1,
};
