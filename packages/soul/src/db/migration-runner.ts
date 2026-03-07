import type Database from 'better-sqlite3';
import { SOUL_DB_MIGRATIONS } from './migrations/index.js';
import { TABLE_SOUL_SCHEMA_VERSION } from './schema.js';

export interface SoulDbMigration {
  description: string;
  up: (db: Database.Database) => void;
  version: number;
}

function ensureSchemaVersionTable(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS ${TABLE_SOUL_SCHEMA_VERSION} (
      version      INTEGER PRIMARY KEY,
      applied_at   TEXT NOT NULL,
      description  TEXT NOT NULL
    );
  `);
}

function getCurrentVersion(db: Database.Database): number {
  const row = db
    .prepare(
      `SELECT COALESCE(MAX(version), 0) as version FROM ${TABLE_SOUL_SCHEMA_VERSION}`,
    )
    .get() as { version?: number } | undefined;

  return row?.version ?? 0;
}

export function runPendingMigrations(
  db: Database.Database,
  migrations: readonly SoulDbMigration[] = SOUL_DB_MIGRATIONS,
): void {
  ensureSchemaVersionTable(db);

  const pendingMigrations = [...migrations]
    .sort((left, right) => left.version - right.version)
    .filter((migration) => migration.version > getCurrentVersion(db));

  for (const migration of pendingMigrations) {
    db.exec('BEGIN');
    try {
      migration.up(db);
      db.prepare(
        `INSERT INTO ${TABLE_SOUL_SCHEMA_VERSION} (version, applied_at, description)
         VALUES (?, ?, ?)`,
      ).run(migration.version, new Date().toISOString(), migration.description);
      db.exec('COMMIT');
    } catch (error) {
      try {
        db.exec('ROLLBACK');
      } catch {
        // Ignore rollback failures and surface the migration failure below.
      }
      throw new Error(
        `failed to apply soul migration v${migration.version} (${migration.description})`,
        { cause: error },
      );
    }
  }
}
