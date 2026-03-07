import type Database from 'better-sqlite3';
import type { SoulDbMigration } from '../migration-runner.js';
import { TABLE_SOUL_BUDGETS } from '../schema.js';

export const v4Migration: SoulDbMigration = {
  description: 'Add soul budgets table',
  up(db: Database.Database): void {
    db.exec(`
      CREATE TABLE IF NOT EXISTS ${TABLE_SOUL_BUDGETS} (
        date         TEXT PRIMARY KEY,
        tokens_used  INTEGER NOT NULL DEFAULT 0,
        dollars_used REAL NOT NULL DEFAULT 0,
        created_at   TEXT NOT NULL,
        updated_at   TEXT NOT NULL
      );
    `);
  },
  version: 4,
};
