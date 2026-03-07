import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { describe, it } from 'node:test';
import { runPendingMigrations, type DbMigration } from '../db/migration-runner.js';
import {
  TABLE_AGENTS,
  TABLE_APPROVAL_QUEUE,
  TABLE_DIAGNOSTICS_BASELINE,
  TABLE_EVENT_LOG,
  TABLE_RUNS,
  TABLE_SCHEMA_VERSION,
  TABLE_SNAPSHOTS,
  TABLE_WORKSPACES,
} from '../db/schema.js';

function getTableNames(db: Database.Database): string[] {
  const rows = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name ASC",
    )
    .all() as Array<{ name: string }>;

  return rows.map((row) => row.name);
}

describe('MigrationRunner', () => {
  it('applies v1 migration and creates expected tables', () => {
    const db = new Database(':memory:');

    runPendingMigrations(db);

    const tableNames = getTableNames(db);
    for (const expected of [
      TABLE_AGENTS,
      TABLE_APPROVAL_QUEUE,
      TABLE_DIAGNOSTICS_BASELINE,
      TABLE_EVENT_LOG,
      TABLE_RUNS,
      TABLE_SCHEMA_VERSION,
      TABLE_SNAPSHOTS,
      TABLE_WORKSPACES,
    ]) {
      assert.equal(
        tableNames.includes(expected),
        true,
        `expected table ${expected} to exist`,
      );
    }

    const versions = db
      .prepare(
        `SELECT version, description FROM ${TABLE_SCHEMA_VERSION} ORDER BY version ASC`,
      )
      .all() as Array<{ description: string; version: number }>;
    assert.deepEqual(versions, [
      { description: 'Initial schema', version: 1 },
      { description: 'Add diagnostics baseline table', version: 2 },
    ]);

    db.close();
  });

  it('is idempotent when run multiple times', () => {
    const db = new Database(':memory:');

    runPendingMigrations(db);
    runPendingMigrations(db);

    const row = db
      .prepare(`SELECT COUNT(*) as count FROM ${TABLE_SCHEMA_VERSION}`)
      .get() as { count: number };
    assert.equal(row.count, 2);

    db.close();
  });

  it('rolls back failed migrations and leaves schema version unchanged', () => {
    const db = new Database(':memory:');

    const failingMigration: DbMigration = {
      description: 'Intentional failure',
      up(database: Database.Database): void {
        database.exec('CREATE TABLE broken_table (id TEXT PRIMARY KEY);');
        throw new Error('boom');
      },
      version: 999,
    };

    assert.throws(
      () => runPendingMigrations(db, [failingMigration]),
      /failed to apply migration v999/i,
    );

    const brokenExists = db
      .prepare(
        "SELECT COUNT(*) as count FROM sqlite_master WHERE type='table' AND name='broken_table'",
      )
      .get() as { count: number };
    assert.equal(brokenExists.count, 0);

    const versionCount = db
      .prepare(`SELECT COUNT(*) as count FROM ${TABLE_SCHEMA_VERSION}`)
      .get() as { count: number };
    assert.equal(versionCount.count, 0);

    db.close();
  });
});
