import type Database from 'better-sqlite3';
import { TABLE_APPROVAL_QUEUE, TABLE_EVENT_LOG } from './schema.js';
import { createReadConnection } from './read-connection.js';

export interface EventLogRow {
  event_type: string;
  payload: string;
  revision: number;
  run_id: string;
  source: string;
  timestamp: string;
}

export class StateStore {
  private readonly dbPath: string;

  constructor(dbPath: string) {
    this.dbPath = dbPath;
  }

  close(): void {
    // Connections are opened per read. This method remains for API symmetry.
  }

  getEventsSince(revision: number): EventLogRow[] {
    const db = this.open();
    if (!db) {
      return [];
    }

    try {
      const stmt = db.prepare(
        `SELECT revision, timestamp, event_type, run_id, source, payload
         FROM ${TABLE_EVENT_LOG}
         WHERE revision > ?
         ORDER BY revision ASC`,
      );
      return stmt.all(revision) as EventLogRow[];
    } catch (error) {
      console.warn('[core][state-store] getEventsSince failed, returning empty', error);
      return [];
    } finally {
      db.close();
    }
  }

  getSnapshot(): Record<string, unknown> {
    // This serves `/state`: a hot_state snapshot, not an async projection or ledger view.
    const db = this.open();
    if (!db) {
      return {
        pendingApprovals: [],
        recentEvents: [],
        revision: 0,
      };
    }

    try {
      const revisionRow = db
        .prepare(`SELECT COALESCE(MAX(revision), 0) as revision FROM ${TABLE_EVENT_LOG}`)
        .get() as { revision: number };
      const eventRows = db
        .prepare(
          `SELECT revision, timestamp, event_type, run_id, source, payload
           FROM ${TABLE_EVENT_LOG}
           ORDER BY revision DESC
           LIMIT 20`,
        )
        .all() as EventLogRow[];
      const approvalRows = db
        .prepare(
          `SELECT approval_id, run_id, tool_name, created_at
           FROM ${TABLE_APPROVAL_QUEUE}
           WHERE status = 'pending'
           ORDER BY created_at ASC`,
        )
        .all() as Array<{
          approval_id: string;
          created_at: string;
          run_id: string;
          tool_name: string;
        }>;

      return {
        pendingApprovals: approvalRows.map((row) => ({
          approvalId: row.approval_id,
          createdAt: row.created_at,
          runId: row.run_id,
          toolName: row.tool_name,
        })),
        recentEvents: eventRows
          .reverse()
          .map((row) => this.parsePayload(row.payload, row.revision, row.source, row.timestamp)),
        revision: revisionRow.revision,
      };
    } catch (error) {
      console.warn('[core][state-store] getSnapshot failed, returning empty snapshot', error);
      return {
        pendingApprovals: [],
        recentEvents: [],
        revision: 0,
      };
    } finally {
      db.close();
    }
  }

  private open(): Database.Database | null {
    try {
      return createReadConnection(this.dbPath);
    } catch (error) {
      console.warn('[core][state-store] open failed, returning empty result', error);
      return null;
    }
  }

  private parsePayload(
    payload: string,
    revision: number,
    source: string,
    timestamp: string,
  ): Record<string, unknown> {
    try {
      return JSON.parse(payload) as Record<string, unknown>;
    } catch (error) {
      console.warn('[core][state-store] failed to parse event payload', error);
      return {
        payload,
        revision,
        source,
        timestamp,
      };
    }
  }
}
