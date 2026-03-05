import type Database from 'better-sqlite3';
import {
  TABLE_AGENTS,
  TABLE_APPROVAL_QUEUE,
  TABLE_EVENT_LOG,
  TABLE_RUNS,
  TABLE_SCHEMA_VERSION,
  TABLE_SNAPSHOTS,
  TABLE_WORKSPACES,
} from '../schema.js';
import type { DbMigration } from '../migration-runner.js';

export const v1Migration: DbMigration = {
  description: 'Initial schema',
  up(db: Database.Database): void {
    db.exec(`
      CREATE TABLE IF NOT EXISTS ${TABLE_EVENT_LOG} (
        revision    INTEGER PRIMARY KEY,
        timestamp   TEXT NOT NULL,
        event_type  TEXT NOT NULL,
        run_id      TEXT,
        source      TEXT NOT NULL,
        payload     TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_event_log_run
        ON ${TABLE_EVENT_LOG}(run_id, revision);
      CREATE INDEX IF NOT EXISTS idx_event_log_type
        ON ${TABLE_EVENT_LOG}(event_type, revision);

      CREATE TABLE IF NOT EXISTS ${TABLE_RUNS} (
        run_id        TEXT PRIMARY KEY,
        workspace_id  TEXT NOT NULL,
        agent_id      TEXT,
        engine_type   TEXT NOT NULL,
        status        TEXT NOT NULL,
        created_at    TEXT NOT NULL,
        updated_at    TEXT NOT NULL,
        completed_at  TEXT,
        error         TEXT,
        metadata      TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_runs_workspace
        ON ${TABLE_RUNS}(workspace_id, status);

      CREATE TABLE IF NOT EXISTS ${TABLE_WORKSPACES} (
        workspace_id    TEXT PRIMARY KEY,
        name            TEXT NOT NULL,
        root_path       TEXT NOT NULL,
        engine_type     TEXT,
        created_at      TEXT NOT NULL,
        last_opened_at  TEXT
      );

      CREATE TABLE IF NOT EXISTS ${TABLE_AGENTS} (
        agent_id    TEXT PRIMARY KEY,
        name        TEXT NOT NULL,
        role        TEXT,
        engine_type TEXT NOT NULL,
        memory_ns   TEXT NOT NULL,
        created_at  TEXT NOT NULL,
        config      TEXT
      );

      CREATE TABLE IF NOT EXISTS ${TABLE_APPROVAL_QUEUE} (
        approval_id  TEXT PRIMARY KEY,
        run_id       TEXT NOT NULL,
        tool_name    TEXT NOT NULL,
        args         TEXT NOT NULL,
        status       TEXT NOT NULL,
        created_at   TEXT NOT NULL,
        resolved_at  TEXT,
        resolver     TEXT,
        FOREIGN KEY(run_id) REFERENCES ${TABLE_RUNS}(run_id)
      );

      CREATE INDEX IF NOT EXISTS idx_approval_run
        ON ${TABLE_APPROVAL_QUEUE}(run_id, status);

      CREATE TABLE IF NOT EXISTS ${TABLE_SNAPSHOTS} (
        snapshot_id  TEXT PRIMARY KEY,
        revision     INTEGER NOT NULL,
        created_at   TEXT NOT NULL,
        payload      TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS ${TABLE_SCHEMA_VERSION} (
        version      INTEGER PRIMARY KEY,
        applied_at   TEXT NOT NULL,
        description  TEXT NOT NULL
      );
    `);
  },
  version: 1,
};
