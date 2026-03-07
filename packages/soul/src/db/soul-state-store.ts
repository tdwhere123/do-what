import type Database from 'better-sqlite3';
import { createReadConnection } from './read-connection.js';
import { TABLE_MEMORY_CUES_FTS } from './schema.js';

export class SoulStateStore {
  private readonly dbPath: string;

  constructor(dbPath: string) {
    this.dbPath = dbPath;
  }

  close(): void {
    // Connections are opened per read for safety and API symmetry.
  }

  isFtsAvailable(): boolean {
    return this.read(
      (db) => {
        const row = db
          .prepare(
            `SELECT name
             FROM sqlite_master
             WHERE name = ?`,
          )
          .get(TABLE_MEMORY_CUES_FTS) as { name?: string } | undefined;
        return row?.name === TABLE_MEMORY_CUES_FTS;
      },
      false,
    );
  }

  read<T>(operation: (db: Database.Database) => T, fallback: T): T {
    // SoulStateStore is a read-only cue db accessor, not the user decision ledger or repo writer.
    const db = this.open();
    if (!db) {
      return fallback;
    }

    try {
      return operation(db);
    } catch (error) {
      console.warn('[soul][state-store] read failed, returning fallback', error);
      return fallback;
    } finally {
      db.close();
    }
  }

  private open(): Database.Database | null {
    try {
      return createReadConnection(this.dbPath);
    } catch (error) {
      console.warn('[soul][state-store] open failed, returning fallback', error);
      return null;
    }
  }
}
