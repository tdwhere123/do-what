import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, describe, it } from 'node:test';
import { runPendingMigrations } from '../db/migration-runner.js';
import { BaselineTracker } from '../integrator/baseline-tracker.js';
import { FastGate } from '../integrator/fast-gate.js';

const tempFiles: string[] = [];

class DirectDbWriter {
  constructor(private readonly dbPath: string) {}

  async write(request: { params: unknown[]; sql: string }): Promise<void> {
    const db = new Database(this.dbPath);
    try {
      db.prepare(request.sql).run(request.params);
    } finally {
      db.close();
    }
  }
}

function createTempDbPath(): string {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'do-what-fast-gate-'));
  tempFiles.push(tempDir);
  return path.join(tempDir, 'state.db');
}

afterEach(() => {
  while (tempFiles.length > 0) {
    const tempDir = tempFiles.pop();
    if (tempDir) {
      fs.rmSync(tempDir, { force: true, recursive: true });
    }
  }
});

describe('FastGate', () => {
  it('creates a baseline on first successful run', async () => {
    const dbPath = createTempDbPath();
    const db = new Database(dbPath);
    runPendingMigrations(db);
    db.close();

    const tracker = new BaselineTracker({
      dbPath,
      dbWriter: new DirectDbWriter(dbPath),
    });
    const gate = new FastGate({
      baselineTracker: tracker,
      commandRunner: async () => ({
        exitCode: 0,
        stderr: '',
        stdout: '',
      }),
    });

    const result = await gate.run({
      touchedPaths: ['packages/core/src/index.ts'],
      workspaceId: 'ws-fast-gate',
      workspacePath: process.cwd(),
    });

    assert.equal(result.passed, true);
    assert.equal(result.createdBaseline, true);
    assert.equal(result.afterErrorCount, 0);
    assert.equal(tracker.get('ws-fast-gate')?.errorCount, 0);
  });

  it('fails when diagnostics exceed the stored baseline', async () => {
    const dbPath = createTempDbPath();
    const db = new Database(dbPath);
    runPendingMigrations(db);
    db.close();

    const tracker = new BaselineTracker({
      dbPath,
      dbWriter: new DirectDbWriter(dbPath),
    });
    await tracker.update('ws-fast-gate', 1);

    const gate = new FastGate({
      baselineTracker: tracker,
      commandRunner: async () => ({
        exitCode: 1,
        stderr: [
          'src/index.ts: error TS2322: Type mismatch',
          'src/run.ts: error TS2304: Missing name',
          'src/http.ts: error TS7006: implicit any',
        ].join('\n'),
        stdout: '',
      }),
    });

    const result = await gate.run({
      touchedPaths: ['packages/core/src/index.ts'],
      workspaceId: 'ws-fast-gate',
      workspacePath: process.cwd(),
    });

    assert.equal(result.passed, false);
    assert.equal(result.baselineErrorCount, 1);
    assert.equal(result.afterErrorCount, 3);
    assert.equal(result.delta, 2);
    assert.equal(result.newDiagnostics.length, 3);
  });
});
