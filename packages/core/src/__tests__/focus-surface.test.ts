import assert from 'node:assert/strict';
import fs from 'node:fs';
import Database from 'better-sqlite3';
import { afterEach, describe, it } from 'node:test';
import type { FocusSurface } from '@do-what/protocol';
import { runPendingMigrations } from '../db/migration-runner.js';
import { BaselineCalculator } from '../governance/baseline-calculator.js';
import { FocusSurfaceRegistry } from '../governance/focus-surface-registry.js';
import { createTempDir } from './git-fixture.js';

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

function createSurface(): FocusSurface {
  return {
    artifact_kind: ['source_file'],
    baseline_fingerprint: 'pending',
    created_at: '2026-03-08T10:00:00.000Z',
    package_scope: ['@do-what/core'],
    path_globs: ['packages/core/src/a.ts'],
    surface_id: 'surface-registry',
    workspace_id: 'ws-registry',
  };
}

function createFakeGitRunner(files: Record<string, string>) {
  return async (args: readonly string[]) => {
    if (args[0] === 'ls-files') {
      const requested = args.slice(args.indexOf('--') + 1);
      const matched = Object.keys(files).filter((filePath) => requested.includes(filePath));
      return { exitCode: 0, stderr: '', stdout: matched.join('\n') };
    }
    if (args[0] === 'hash-object') {
      return {
        exitCode: 0,
        stderr: '',
        stdout: `${files[String(args[1])]}\n`,
      };
    }
    throw new Error(`unexpected git command: ${args.join(' ')}`);
  };
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const tempDir = tempDirs.pop();
    if (tempDir) {
      fs.rmSync(tempDir, { force: true, recursive: true });
    }
  }
});

describe('focus-surface', () => {
  it('registers a surface and persists its baseline lock', async () => {
    const stateDir = createTempDir('do-what-focus-surface-');
    tempDirs.push(stateDir);
    const dbPath = `${stateDir}/state.db`;
    const db = new Database(dbPath);
    runPendingMigrations(db);
    db.prepare(
      `INSERT INTO runs (
        run_id, workspace_id, agent_id, engine_type, status, created_at, updated_at, completed_at, error, metadata
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      'run-focus',
      'ws-registry',
      null,
      'claude',
      'completed',
      '2026-03-08T10:00:00.000Z',
      '2026-03-08T10:00:00.000Z',
      '2026-03-08T10:00:00.000Z',
      null,
      '{}',
    );
    db.close();

    const repoPath = createTempDir('do-what-focus-repo-');
    tempDirs.push(repoPath);
    fs.mkdirSync(`${repoPath}/packages/core/src`, { recursive: true });
    fs.writeFileSync(`${repoPath}/packages/core/src/a.ts`, 'export const a = 1;\n', 'utf8');

    const registry = new FocusSurfaceRegistry({
      baselineCalculator: new BaselineCalculator({
        gitRunner: createFakeGitRunner({
          'packages/core/src/a.ts': 'hash-a',
        }),
        now: () => '2026-03-08T10:00:00.000Z',
        repoPath,
      }),
      dbPath,
      dbWriter: new DirectDbWriter(dbPath),
    });

    const registered = await registry.register('run-focus', createSurface());
    const stored = registry.getByRunId('run-focus');

    assert.equal(registered.surface.baseline_fingerprint.length > 0, true);
    assert.equal(stored?.baseline_fingerprint, registered.lock.baseline_fingerprint);
    assert.deepEqual(
      stored?.files_snapshot.map((snapshot) => snapshot.path),
      ['packages/core/src/a.ts'],
    );
  });
});
