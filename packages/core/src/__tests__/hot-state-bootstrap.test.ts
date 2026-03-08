import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, describe, it } from 'node:test';
import { runPendingMigrations } from '../db/migration-runner.js';
import { HotStateManager } from '../state/hot-state-manager.js';

const tempDirs: string[] = [];

function createTempDb(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'do-what-hot-state-'));
  tempDirs.push(dir);
  return path.join(dir, 'state.db');
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) {
      fs.rmSync(dir, { force: true, recursive: true });
    }
  }
});

describe('HotStateManager bootstrap', () => {
  it('replays event log and loads current run and approval state', async () => {
    const dbPath = createTempDb();
    const db = new Database(dbPath);
    runPendingMigrations(db);

    db.prepare(
      `INSERT INTO event_log (revision, timestamp, event_type, run_id, source, payload)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(
      1,
      '2026-03-08T10:00:00.000Z',
      'engine_connect',
      'system',
      'core.engine-machine',
      JSON.stringify({
        engineType: 'claude',
        event: 'engine_connect',
        revision: 1,
        runId: 'system',
        source: 'core.engine-machine',
        timestamp: '2026-03-08T10:00:00.000Z',
        version: '1.2.3',
      }),
    );
    db.prepare(
      `INSERT INTO runs (
        run_id, workspace_id, agent_id, engine_type, status, created_at, updated_at, completed_at, error, metadata
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      'run-bootstrap',
      'ws-bootstrap',
      null,
      'claude',
      'waiting_approval',
      '2026-03-08T10:00:01.000Z',
      '2026-03-08T10:00:02.000Z',
      null,
      null,
      null,
    );
    db.prepare(
      `INSERT INTO approval_queue (
        approval_id, run_id, tool_name, args, status, created_at, resolved_at, resolver
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      'approval-bootstrap',
      'run-bootstrap',
      'tools.shell_exec',
      '{}',
      'pending',
      '2026-03-08T10:00:03.000Z',
      null,
      null,
    );
    db.close();

    const manager = new HotStateManager({
      dbPath,
    });
    await manager.bootstrap();

    const snapshot = manager.snapshot();
    assert.equal(snapshot.last_event_seq, 1);
    assert.equal(snapshot.engines.get('claude')?.status, 'connected');
    assert.equal(snapshot.runs.get('run-bootstrap')?.status, 'waiting_approval');
    assert.equal(snapshot.runs.get('run-bootstrap')?.active_approval_id, 'approval-bootstrap');
    assert.equal(snapshot.pending_approvals.get('approval-bootstrap')?.tool_name, 'tools.shell_exec');
  });

  it('loads governance_invalid rows from the run table', async () => {
    const dbPath = createTempDb();
    const db = new Database(dbPath);
    runPendingMigrations(db);

    db.prepare(
      `INSERT INTO runs (
        run_id, workspace_id, agent_id, engine_type, status, created_at, updated_at, completed_at, error, metadata
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      'run-governance',
      'ws-governance',
      null,
      'claude',
      'governance_invalid',
      '2026-03-08T10:00:01.000Z',
      '2026-03-08T10:00:02.000Z',
      '2026-03-08T10:00:02.000Z',
      'lease invalidated',
      null,
    );
    db.close();

    const manager = new HotStateManager({
      dbPath,
    });
    await manager.bootstrap();

    const snapshot = manager.snapshot();
    assert.equal(snapshot.runs.get('run-governance')?.status, 'governance_invalid');
  });
});
