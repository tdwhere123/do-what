import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { afterEach, describe, it } from 'node:test';
import { runPendingMigrations } from '../db/migration-runner.js';
import {
  v1Migration,
  v2Migration,
  v3Migration,
  v4Migration,
  v5Migration,
  v6Migration,
} from '../db/migrations/index.js';
import { normalizeCueDraft } from '../write/draft-normalizer.js';
import { createSoulTestEnv, type SoulTestEnv } from './helpers.js';

const activeEnvs: SoulTestEnv[] = [];

function createLegacyDb(): Database.Database {
  const env = createSoulTestEnv();
  activeEnvs.push(env);
  const db = new Database(env.dbPath);
  db.exec('DELETE FROM soul_schema_version');
  db.exec('DROP TABLE IF EXISTS memory_cues_fts');
  db.exec('DROP TRIGGER IF EXISTS cue_ai');
  db.exec('DROP TRIGGER IF EXISTS cue_ad');
  db.exec('DROP TRIGGER IF EXISTS cue_au');
  db.exec('DROP TABLE IF EXISTS refactor_events');
  db.exec('DROP TABLE IF EXISTS soul_budgets');
  db.exec('DROP TABLE IF EXISTS memory_proposals');
  db.exec('DROP TABLE IF EXISTS evidence_index');
  db.exec('DROP TABLE IF EXISTS memory_graph_edges');
  db.exec('DROP TABLE IF EXISTS memory_cues');
  db.exec('DROP TABLE IF EXISTS projects');
  runPendingMigrations(db, [
    v1Migration,
    v2Migration,
    v3Migration,
    v4Migration,
    v5Migration,
  ]);
  return db;
}

afterEach(() => {
  while (activeEnvs.length > 0) {
    activeEnvs.pop()?.cleanup();
  }
});

describe('concept unification', () => {
  it('maps legacy cue type to modern formation_kind and dimension in the normalizer', () => {
    const normalized = normalizeCueDraft(
      {
        anchors: ['auth'],
        gist: 'legacy auth note',
        type: 'decision',
      },
      'working',
    );

    assert.equal(normalized.formationKind, 'interaction');
    assert.equal(normalized.dimension, 'behavioral');
    assert.equal(normalized.focusSurface, 'default');
  });

  it('backfills legacy rows during v6 migration', () => {
    const db = createLegacyDb();
    db.exec('ALTER TABLE memory_cues ADD COLUMN type TEXT');
    db.prepare(
      `INSERT INTO memory_cues (
        cue_id,
        project_id,
        gist,
        source,
        type,
        anchors,
        pointers,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      'legacy-cue',
      'proj-legacy',
      'legacy risk note',
      'compiler',
      'risk',
      '["legacy"]',
      '[]',
      new Date().toISOString(),
      new Date().toISOString(),
    );

    runPendingMigrations(db, [v6Migration]);

    const row = db
      .prepare(
        `SELECT formation_kind, dimension, focus_surface, pruned
         FROM memory_cues
         WHERE cue_id = ?`,
      )
      .get('legacy-cue') as
      | {
          dimension: string;
          focus_surface: string;
          formation_kind: string;
          pruned: number;
        }
      | undefined;
    db.close();

    assert.equal(row?.formation_kind, 'synthesis');
    assert.equal(row?.dimension, 'contextual');
    assert.equal(row?.focus_surface, 'default');
    assert.equal(row?.pruned, 0);
  });
});
