import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { runPendingMigrations } from '../db/migration-runner.js';

export interface SoulTestEnv {
  cleanup: () => void;
  dbPath: string;
  insertSql: (sql: string, params?: readonly unknown[]) => void;
  memoryRepoBasePath: string;
  tempDir: string;
  workspaceRoot: string;
}

export function createSoulTestEnv(): SoulTestEnv {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'do-what-soul-test-'));
  const workspaceRoot = path.join(tempDir, 'workspace');
  const dbPath = path.join(tempDir, 'soul.db');
  const memoryRepoBasePath = path.join(tempDir, 'memory');

  fs.mkdirSync(workspaceRoot, { recursive: true });
  fs.mkdirSync(memoryRepoBasePath, { recursive: true });

  const db = new Database(dbPath);
  runPendingMigrations(db);
  db.close();

  return {
    cleanup: () => {
      fs.rmSync(tempDir, { force: true, recursive: true });
    },
    dbPath,
    insertSql: (sql: string, params: readonly unknown[] = []) => {
      const writable = new Database(dbPath);
      writable.prepare(sql).run(...params);
      writable.close();
    },
    memoryRepoBasePath,
    tempDir,
    workspaceRoot,
  };
}
