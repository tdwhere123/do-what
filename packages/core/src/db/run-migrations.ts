import Database from 'better-sqlite3';
import path from 'node:path';
import { STATE_DIR, ensureRuntimeDirs } from '../config.js';
import { runPendingMigrations } from './migration-runner.js';

ensureRuntimeDirs({
  stateDir: STATE_DIR,
});

const dbPath = path.join(STATE_DIR, 'state.db');
const db = new Database(dbPath);

try {
  runPendingMigrations(db);
  console.log(`[core][db] migrations applied to ${dbPath}`);
} finally {
  db.close();
}
