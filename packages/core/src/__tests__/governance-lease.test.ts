import assert from 'node:assert/strict';
import fs from 'node:fs';
import Database from 'better-sqlite3';
import { afterEach, describe, it } from 'node:test';
import type { FocusSurface } from '@do-what/protocol';
import { runPendingMigrations } from '../db/migration-runner.js';
import { createReadConnection } from '../db/read-connection.js';
import { GovernanceLeaseManager } from '../governance/lease-manager.js';
import { NativeSurfaceReporter } from '../governance/native-surface-report.js';
import { GovernancePreflight } from '../governance/preflight.js';
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

function createSurface(
  surfaceId: string,
  pathGlobs: readonly string[],
  artifactKind: FocusSurface['artifact_kind'],
): FocusSurface {
  return {
    artifact_kind: [...artifactKind],
    baseline_fingerprint: 'baseline',
    created_at: '2026-03-08T10:00:00.000Z',
    package_scope: ['@do-what/core'],
    path_globs: [...pathGlobs],
    surface_id: surfaceId,
    workspace_id: 'ws-governance',
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

describe('governance-lease', () => {
  it('allows path_overlap but records soft conflict conclusions', async () => {
    const stateDir = createTempDir('do-what-governance-lease-');
    tempDirs.push(stateDir);
    const dbPath = `${stateDir}/state.db`;
    const db = new Database(dbPath);
    runPendingMigrations(db);
    db.close();

    const now = () => '2026-03-08T10:00:00.000Z';
    const manager = new GovernanceLeaseManager({
      dbPath,
      dbWriter: new DirectDbWriter(dbPath),
      now,
    });
    const preflight = new GovernancePreflight({
      leaseManager: manager,
      reporter: new NativeSurfaceReporter({ now }),
    });

    await manager.issue(
      'run-a',
      createSurface('surface-a', ['packages/core/src/a.ts'], ['source_file']),
      [],
    );
    const result = await preflight.evaluate(
      'run-b',
      createSurface('surface-b', ['packages/core/src/a.ts'], ['source_file']),
    );

    assert.equal(result.allowed, true);
    assert.equal(result.lease?.conflict_conclusions[0]?.resolution, 'allow_soft');
  });

  it('rejects migration conflicts during preflight', async () => {
    const stateDir = createTempDir('do-what-governance-block-');
    tempDirs.push(stateDir);
    const dbPath = `${stateDir}/state.db`;
    const db = new Database(dbPath);
    runPendingMigrations(db);
    db.close();

    const now = () => '2026-03-08T10:00:00.000Z';
    const manager = new GovernanceLeaseManager({
      dbPath,
      dbWriter: new DirectDbWriter(dbPath),
      now,
    });
    const preflight = new GovernancePreflight({
      leaseManager: manager,
      reporter: new NativeSurfaceReporter({ now }),
    });

    await manager.issue(
      'run-a',
      createSurface('surface-a', ['packages/core/src/db/migrations/v5.ts'], ['migration']),
      [],
    );
    const result = await preflight.evaluate(
      'run-b',
      createSurface('surface-b', ['packages/core/src/db/migrations/v5.ts'], ['migration']),
    );

    assert.equal(result.allowed, false);
    assert.equal(result.conflictKind, 'migration_conflict');
  });

  it('invalidates matching active leases when main changes land', async () => {
    const stateDir = createTempDir('do-what-governance-invalidate-');
    tempDirs.push(stateDir);
    const dbPath = `${stateDir}/state.db`;
    const db = new Database(dbPath);
    runPendingMigrations(db);
    db.close();

    const invalidatedRuns: string[] = [];
    const manager = new GovernanceLeaseManager({
      dbPath,
      dbWriter: new DirectDbWriter(dbPath),
      governanceInvalidator: {
        invalidateRun(runId) {
          invalidatedRuns.push(runId);
        },
      },
      now: () => '2026-03-08T10:00:00.000Z',
    });
    await manager.issue(
      'run-active',
      createSurface('surface-active', ['packages/core/src/a.ts'], ['source_file']),
      [],
    );

    await manager.invalidateByPaths({
      changedPaths: ['packages/core/src/a.ts'],
      sourceRunId: 'run-main',
      workspaceId: 'ws-governance',
    });

    const dbRead = createReadConnection(dbPath);
    const row = dbRead
      .prepare(`SELECT status FROM governance_leases WHERE run_id = ?`)
      .get('run-active') as { status: string };
    dbRead.close();

    assert.deepEqual(invalidatedRuns, ['run-active']);
    assert.equal(row.status, 'invalidated');
  });
});
