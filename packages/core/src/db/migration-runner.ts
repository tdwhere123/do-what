import type Database from 'better-sqlite3';
import { DB_MIGRATIONS } from './migrations/index.js';
import { TABLE_SCHEMA_VERSION } from './schema.js';

export interface DbMigration {
  description: string;
  up: (db: Database.Database) => void;
  version: number;
}

function ensureSchemaVersionTable(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS ${TABLE_SCHEMA_VERSION} (
      version      INTEGER PRIMARY KEY,
      applied_at   TEXT NOT NULL,
      description  TEXT NOT NULL
    );
  `);
}

function getCurrentVersion(db: Database.Database): number {
  const row = db
    .prepare(
      `SELECT COALESCE(MAX(version), 0) as version FROM ${TABLE_SCHEMA_VERSION}`,
    )
    .get() as { version?: number } | undefined;

  return row?.version ?? 0;
}

export function runPendingMigrations(
  db: Database.Database,
  migrations: readonly DbMigration[] = DB_MIGRATIONS,
): void {
  ensureSchemaVersionTable(db);

  const currentVersion = getCurrentVersion(db);
  const pendingMigrations = [...migrations]
    .sort((a, b) => a.version - b.version)
    .filter((migration) => migration.version > currentVersion);

  for (const migration of pendingMigrations) {
    db.exec('BEGIN');
    try {
      migration.up(db);
      db.prepare(
        `INSERT INTO ${TABLE_SCHEMA_VERSION} (version, applied_at, description)
         VALUES (?, ?, ?)`,
      ).run(
        migration.version,
        new Date().toISOString(),
        migration.description,
      );
      db.exec('COMMIT');
    } catch (error) {
      try {
        db.exec('ROLLBACK');
      } catch {
        // ignore rollback errors and report the original failure below
      }
      throw new Error(
        `failed to apply migration v${migration.version} (${migration.description})`,
        { cause: error },
      );
    }
  }
}
