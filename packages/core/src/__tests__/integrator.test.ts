import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, describe, it } from 'node:test';
import type { GitRunner } from '@do-what/tools';
import { runPendingMigrations } from '../db/migration-runner.js';
import type { FastGateResult } from '../integrator/fast-gate.js';
import { Integrator } from '../integrator/integrator.js';
import { writeRepoFile } from './git-fixture.js';

const tempDirs: string[] = [];

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

class FakeEventBus {
  readonly events: Array<Record<string, unknown>> = [];

  publish(event: Record<string, unknown>): void {
    this.events.push(event);
  }
}

async function waitFor(
  predicate: () => boolean,
  timeoutMs = 1000,
): Promise<void> {
  const startedAt = Date.now();
  while (!predicate()) {
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error('timed out waiting for condition');
    }
    await new Promise((resolve) => {
      setTimeout(resolve, 10);
    });
  }
}

function createFakeGitRunner(
  files: Record<string, string>,
  options: {
    applyError?: string;
  } = {},
): GitRunner {
  return async (args) => {
    if (args[0] === 'ls-files') {
      const requested = args.slice(args.indexOf('--') + 1);
      const matched = Object.keys(files).filter((filePath) => requested.includes(filePath));
      return { exitCode: 0, stderr: '', stdout: matched.join('\n') };
    }
    if (args[0] === 'hash-object') {
      const hash = files[String(args[1])];
      return { exitCode: 0, stderr: '', stdout: `${hash ?? ''}\n` };
    }
    if (args[0] === 'apply') {
      if (options.applyError) {
        throw new Error(options.applyError);
      }
      return { exitCode: 0, stderr: '', stdout: '' };
    }
    throw new Error(`unexpected git command: ${args.join(' ')}`);
  };
}

function createTempState(): {
  dbPath: string;
  repoPath: string;
  trackedFiles: Record<string, string>;
} {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'do-what-integrator-'));
  tempDirs.push(tempDir);
  const dbPath = path.join(tempDir, 'state.db');
  const repoPath = path.join(tempDir, 'repo');
  fs.mkdirSync(repoPath, { recursive: true });

  const db = new Database(dbPath);
  runPendingMigrations(db);
  db.close();

  writeRepoFile(repoPath, 'packages/core/src/index.ts', 'export const repo = true;\n');
  writeRepoFile(repoPath, 'packages/core/src/other.ts', 'export const other = true;\n');
  return {
    dbPath,
    repoPath,
    trackedFiles: {
      'packages/core/src/index.ts': 'hash-index',
      'packages/core/src/other.ts': 'hash-other',
    },
  };
}

function insertRun(dbPath: string, runId: string): void {
  const db = new Database(dbPath);
  try {
    db.prepare(
      `INSERT INTO runs (
        run_id,
        workspace_id,
        agent_id,
        engine_type,
        status,
        created_at,
        updated_at,
        completed_at,
        error,
        metadata
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      runId,
      'ws-integrator',
      null,
      'claude',
      'completed',
      '2026-01-01T00:00:00.000Z',
      '2026-01-01T00:00:00.000Z',
      '2026-01-01T00:00:00.000Z',
      null,
      '{}',
    );
  } finally {
    db.close();
  }
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const tempDir = tempDirs.pop();
    if (tempDir) {
      fs.rmSync(tempDir, { force: true, recursive: true });
    }
  }
});

describe('Integrator', () => {
  it('publishes gate_passed and updates run metadata on success', async () => {
    const { dbPath, repoPath, trackedFiles } = createTempState();
    insertRun(dbPath, 'run-success');

    const eventBus = new FakeEventBus();
    const integrator = new Integrator({
      dbPath,
      dbWriter: new DirectDbWriter(dbPath),
      eventBus,
      fastGate: {
        async run() {
          return {
            afterErrorCount: 0,
            baselineErrorCount: 0,
            commands: [],
            createdBaseline: true,
            delta: 0,
            newDiagnostics: [],
            passed: true,
          };
        },
      },
      gitRunner: createFakeGitRunner(trackedFiles),
      repoPath,
    });

    await integrator.submit({
      completedAt: '2026-01-01T00:00:01.000Z',
      patch: '',
      runId: 'run-success',
      touchedPaths: ['packages/core/src/index.ts'],
      workspaceId: 'ws-integrator',
    });

    assert.equal(eventBus.events[0]?.event, 'gate_passed');

    const db = new Database(dbPath, { readonly: true });
    const row = db
      .prepare('SELECT metadata FROM runs WHERE run_id = ?')
      .get('run-success') as { metadata: string };
    db.close();
    const metadata = JSON.parse(row.metadata) as { integrationStatus?: string };
    assert.equal(metadata.integrationStatus, 'gate_passed');
  });

  it('publishes conflict when git apply fails', async () => {
    const { dbPath, repoPath, trackedFiles } = createTempState();
    insertRun(dbPath, 'run-conflict');

    const eventBus = new FakeEventBus();
    const integrator = new Integrator({
      dbPath,
      dbWriter: new DirectDbWriter(dbPath),
      eventBus,
      fastGate: {
        async run() {
          throw new Error('fast gate should not run on conflict');
        },
      },
      gitRunner: createFakeGitRunner(trackedFiles, { applyError: 'git apply failed' }),
      repoPath,
    });

    await integrator.submit({
      completedAt: '2026-01-01T00:00:01.000Z',
      patch: 'diff --git a/a.txt b/a.txt',
      runId: 'run-conflict',
      touchedPaths: ['packages/core/src/index.ts'],
      workspaceId: 'ws-integrator',
    });

    assert.equal(eventBus.events[0]?.event, 'conflict');
  });

  it('publishes gate_failed and replay_requested when the fast gate fails', async () => {
    const { dbPath, repoPath, trackedFiles } = createTempState();
    insertRun(dbPath, 'run-a');
    insertRun(dbPath, 'run-b');

    const eventBus = new FakeEventBus();
    let resolveGate: ((result: FastGateResult) => void) | undefined;

    const integrator = new Integrator({
      dbPath,
      dbWriter: new DirectDbWriter(dbPath),
      eventBus,
      fastGate: {
        run: async () =>
          new Promise<FastGateResult>((resolve) => {
            resolveGate = resolve;
          }),
      },
      gitRunner: createFakeGitRunner(trackedFiles),
      repoPath,
    });

    const first = integrator.submit({
      completedAt: '2026-01-01T00:00:01.000Z',
      patch: '',
      runId: 'run-a',
      touchedPaths: ['packages/core/src/index.ts'],
      workspaceId: 'ws-integrator',
    });
    const second = integrator.submit({
      completedAt: '2026-01-01T00:00:02.000Z',
      patch: '',
      runId: 'run-b',
      touchedPaths: ['packages/core/src/other.ts'],
      workspaceId: 'ws-integrator',
    });

    await waitFor(() => resolveGate !== undefined);
    resolveGate?.({
      afterErrorCount: 3,
      baselineErrorCount: 1,
      commands: [],
      createdBaseline: false,
      delta: 2,
      newDiagnostics: ['new error'],
      passed: false,
    });

    await first;
    await second;

    assert.deepEqual(
      eventBus.events.map((event) => event.event),
      ['gate_failed', 'replay_requested'],
    );
    assert.deepEqual(eventBus.events[1]?.affectedRunIds, ['run-b']);
  });
});
