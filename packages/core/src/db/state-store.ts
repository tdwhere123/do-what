import type Database from 'better-sqlite3';
import { createReadConnection } from './read-connection.js';

export interface EventLogRow {
  event_type: string;
  payload: string;
  revision: number;
  run_id: string;
  source: string;
}

export class StateStore {
  private readonly db: Database.Database;

  constructor(dbPath: string) {
    this.db = createReadConnection(dbPath);
  }

  close(): void {
    this.db.close();
  }

  getEventsSince(revision: number): EventLogRow[] {
    try {
      const stmt = this.db.prepare(
        `SELECT revision, event_type, run_id, source, payload
         FROM event_log
         WHERE revision > ?
         ORDER BY revision ASC`,
      );
      return stmt.all(revision) as EventLogRow[];
    } catch {
      return [];
    }
  }

  getSnapshot(): Record<string, unknown> {
    return {};
  }
}
