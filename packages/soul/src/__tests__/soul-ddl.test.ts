import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, describe, it } from 'node:test';
import { runPendingMigrations } from '../db/migration-runner.js';

const tempDirs: string[] = [];

function createDbPath(): string {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'do-what-soul-ddl-'));
  tempDirs.push(tempDir);
  return path.join(tempDir, 'soul.db');
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const tempDir = tempDirs.pop();
    if (tempDir) {
      fs.rmSync(tempDir, { force: true, recursive: true });
    }
  }
});

describe('soul ddl migrations', () => {
  it('creates the expected tables and is idempotent', () => {
    const dbPath = createDbPath();
    const db = new Database(dbPath);

    runPendingMigrations(db);
    runPendingMigrations(db);

    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all() as Array<{ name: string }>;
    const tableNames = new Set(tables.map((row) => row.name));

    assert.equal(tableNames.has('memory_cues'), true);
    assert.equal(tableNames.has('memory_graph_edges'), true);
    assert.equal(tableNames.has('evidence_index'), true);
    assert.equal(tableNames.has('projects'), true);
    assert.equal(tableNames.has('memory_proposals'), true);
    assert.equal(tableNames.has('refactor_events'), true);
    assert.equal(tableNames.has('soul_schema_version'), true);
    assert.equal(tableNames.has('soul_budgets'), true);

    const versionRow = db
      .prepare('SELECT COALESCE(MAX(version), 0) AS version FROM soul_schema_version')
      .get() as { version: number };
    assert.equal(versionRow.version, 7);

    const cueColumns = db
      .prepare('PRAGMA table_info(memory_cues)')
      .all() as Array<{ name: string }>;
    const cueColumnNames = new Set(cueColumns.map((row) => row.name));
    assert.equal(cueColumnNames.has('type'), true);
    assert.equal(cueColumnNames.has('claim_draft'), true);
    assert.equal(cueColumnNames.has('claim_confidence'), true);
    assert.equal(cueColumnNames.has('claim_gist'), true);
    assert.equal(cueColumnNames.has('claim_source'), true);
    assert.equal(cueColumnNames.has('snippet_excerpt'), true);
    assert.equal(cueColumnNames.has('pruned'), true);

    const evidenceColumns = db
      .prepare('PRAGMA table_info(evidence_index)')
      .all() as Array<{ name: string }>;
    const evidenceColumnNames = new Set(evidenceColumns.map((row) => row.name));
    assert.equal(evidenceColumnNames.has('git_commit'), true);
    assert.equal(evidenceColumnNames.has('repo_path'), true);
    assert.equal(evidenceColumnNames.has('symbol'), true);
    assert.equal(evidenceColumnNames.has('snippet_excerpt'), true);
    assert.equal(evidenceColumnNames.has('context_fingerprint'), true);
    assert.equal(evidenceColumnNames.has('confidence'), true);
    assert.equal(evidenceColumnNames.has('created_at'), true);

    db.close();
  });

  it('keeps FTS optional but functional when available', () => {
    const dbPath = createDbPath();
    const db = new Database(dbPath);

    runPendingMigrations(db);

    const ftsRow = db
      .prepare("SELECT name FROM sqlite_master WHERE name = 'memory_cues_fts'")
      .get() as { name?: string } | undefined;

    db.prepare(
      `INSERT INTO memory_cues (
        cue_id,
        project_id,
        gist,
        source,
        anchors,
        pointers,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      'cue-1',
      'project-1',
      'auth logic moved to middleware',
      'compiler',
      '["auth"]',
      '[]',
      new Date().toISOString(),
      new Date().toISOString(),
    );

    if (ftsRow?.name === 'memory_cues_fts') {
      const rows = db
        .prepare(
          "SELECT rowid FROM memory_cues_fts WHERE memory_cues_fts MATCH 'auth'",
        )
        .all() as Array<{ rowid: number }>;
      assert.equal(rows.length > 0, true);
    } else {
      const likeRows = db
        .prepare("SELECT cue_id FROM memory_cues WHERE gist LIKE '%auth%'")
        .all() as Array<{ cue_id: string }>;
      assert.deepEqual(likeRows, [{ cue_id: 'cue-1' }]);
    }

    db.close();
  });
});
