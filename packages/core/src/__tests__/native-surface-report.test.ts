import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { FocusSurface, GovernanceLease } from '@do-what/protocol';
import { NativeSurfaceReporter } from '../governance/native-surface-report.js';

function createSurface(surfaceId: string, pathGlobs: readonly string[]): FocusSurface {
  return {
    artifact_kind: ['source_file'],
    baseline_fingerprint: 'baseline',
    created_at: '2026-03-08T10:00:00.000Z',
    package_scope: ['@do-what/core'],
    path_globs: [...pathGlobs],
    surface_id: surfaceId,
    workspace_id: 'ws-report',
  };
}

function createLease(runId: string, surface: FocusSurface): GovernanceLease {
  return {
    conflict_conclusions: [],
    expires_at: '2026-03-08T14:00:00.000Z',
    invalidation_conditions: [],
    issued_at: '2026-03-08T10:00:00.000Z',
    lease_id: `lease-${runId}`,
    run_id: runId,
    status: 'active',
    surface_id: surface.surface_id,
    valid_snapshot: surface,
    workspace_id: surface.workspace_id,
  };
}

describe('native-surface-report', () => {
  it('marks aligned surfaces when there is no overlap', () => {
    const reporter = new NativeSurfaceReporter({
      now: () => '2026-03-08T10:00:00.000Z',
    });
    const report = reporter.generateReport(
      'ws-report',
      'run-a',
      createSurface('surface-a', ['packages/core/src/a.ts']),
      [],
    );

    assert.equal(report.surfaces[0]?.status, 'aligned');
  });

  it('marks candidate as shadowed when another surface covers it', () => {
    const reporter = new NativeSurfaceReporter({
      now: () => '2026-03-08T10:00:00.000Z',
    });
    const candidate = createSurface('surface-b', ['packages/core/src/a.ts']);
    const covering = createSurface('surface-cover', [
      'packages/core/src/a.ts',
      'packages/core/src/b.ts',
    ]);
    const report = reporter.generateReport(
      'ws-report',
      'run-b',
      candidate,
      [createLease('run-cover', covering)],
    );

    assert.equal(report.surfaces[0]?.status, 'shadowed');
  });

  it('marks conflicting surfaces when paths overlap', () => {
    const reporter = new NativeSurfaceReporter({
      now: () => '2026-03-08T10:00:00.000Z',
    });
    const candidate = createSurface('surface-c', ['packages/core/src/a.ts']);
    const report = reporter.generateReport(
      'ws-report',
      'run-c',
      candidate,
      [createLease('run-conflict', createSurface('surface-d', ['packages/core/src/a.ts']))],
    );

    assert.equal(report.surfaces[0]?.status, 'conflicting');
    assert.equal(report.surfaces[1]?.status, 'conflicting');
  });
});
