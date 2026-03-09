import assert from 'node:assert/strict';
import fs from 'node:fs';
import { afterEach, describe, it } from 'node:test';
import type { FocusSurface } from '@do-what/protocol';
import { BaselineCalculator } from '../governance/baseline-calculator.js';
import { IntegrationGate } from '../governance/integration-gate.js';
import { ReconcileTracker } from '../governance/reconcile-tracker.js';
import { createTempDir } from './git-fixture.js';

const tempDirs: string[] = [];

function writeRepoFile(repoPath: string, relativePath: string, content: string): void {
  const absolutePath = `${repoPath}/${relativePath}`;
  fs.mkdirSync(absolutePath.substring(0, absolutePath.lastIndexOf('/')), { recursive: true });
  fs.writeFileSync(absolutePath, content, 'utf8');
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

function createGate(repoPath: string, files: Record<string, string>): IntegrationGate {
  return new IntegrationGate({
    baselineCalculator: new BaselineCalculator({
      gitRunner: createFakeGitRunner(files),
      now: () => '2026-03-08T10:00:00.000Z',
      repoPath,
    }),
    reconcileTracker: new ReconcileTracker(),
  });
}

function createSurface(
  pathGlobs: readonly string[],
  artifactKind?: FocusSurface['artifact_kind'],
): FocusSurface {
  return {
    artifact_kind:
      artifactKind === undefined
        ? pathGlobs.map((filePath) => (filePath.endsWith('.test.ts') ? 'test_file' : 'source_file'))
        : [...artifactKind],
    baseline_fingerprint: 'pending',
    created_at: '2026-03-08T10:00:00.000Z',
    package_scope: ['@do-what/core'],
    path_globs: [...pathGlobs],
    surface_id: 'surface-gate',
    workspace_id: 'ws-gate',
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

describe('integration-gate', () => {
  it('treats unrelated changes as ignore', async () => {
    const repoPath = createTempDir('do-what-gate-ignore-');
    tempDirs.push(repoPath);
    writeRepoFile(repoPath, 'packages/core/src/a.ts', 'export const a = 1;\n');
    writeRepoFile(repoPath, 'README.md', '# readme\n');
    const files = {
      'README.md': 'hash-readme-1',
      'packages/core/src/a.ts': 'hash-a-1',
    };

    const calculator = new BaselineCalculator({
      gitRunner: createFakeGitRunner(files),
      now: () => '2026-03-08T10:00:00.000Z',
      repoPath,
    });
    const surface = createSurface(['packages/core/src/a.ts']);
    const branchLock = await calculator.computeBaselineLock(surface, 'run-ignore');

    files['README.md'] = 'hash-readme-2';

    const evaluation = await createGate(repoPath, files).canMerge(
      'run-ignore',
      branchLock,
      surface,
    );
    assert.equal(evaluation.assessment.drift_kind, 'ignore');
    assert.equal(evaluation.decision.reason, 'no_drift');
  });

  it('treats unrelated schema surfaces as ignore', async () => {
    const repoPath = createTempDir('do-what-gate-ignore-schema-');
    tempDirs.push(repoPath);
    writeRepoFile(repoPath, 'packages/protocol/src/core/drift.ts', 'export const drift = true;\n');
    writeRepoFile(repoPath, 'README.md', '# readme\n');
    const files = {
      'README.md': 'hash-readme-1',
      'packages/protocol/src/core/drift.ts': 'hash-schema-1',
    };

    const calculator = new BaselineCalculator({
      gitRunner: createFakeGitRunner(files),
      now: () => '2026-03-08T10:00:00.000Z',
      repoPath,
    });
    const surface = createSurface(['packages/protocol/src/core/drift.ts'], ['schema_type']);
    const branchLock = await calculator.computeBaselineLock(surface, 'run-ignore-schema');

    files['README.md'] = 'hash-readme-2';

    const evaluation = await createGate(repoPath, files).canMerge(
      'run-ignore-schema',
      branchLock,
      surface,
    );
    assert.equal(evaluation.assessment.drift_kind, 'ignore');
    assert.equal(evaluation.decision.reason, 'no_drift');
  });

  it('treats unrelated config surfaces as ignore', async () => {
    const repoPath = createTempDir('do-what-gate-ignore-config-');
    tempDirs.push(repoPath);
    writeRepoFile(repoPath, 'packages/core/tsconfig.json', '{\"extends\":\"../../tsconfig.base.json\"}\n');
    writeRepoFile(repoPath, 'README.md', '# readme\n');
    const files = {
      'README.md': 'hash-readme-1',
      'packages/core/tsconfig.json': 'hash-config-1',
    };

    const calculator = new BaselineCalculator({
      gitRunner: createFakeGitRunner(files),
      now: () => '2026-03-08T10:00:00.000Z',
      repoPath,
    });
    const surface = createSurface(['packages/core/tsconfig.json'], ['config']);
    const branchLock = await calculator.computeBaselineLock(surface, 'run-ignore-config');

    files['README.md'] = 'hash-readme-2';

    const evaluation = await createGate(repoPath, files).canMerge(
      'run-ignore-config',
      branchLock,
      surface,
    );
    assert.equal(evaluation.assessment.drift_kind, 'ignore');
    assert.equal(evaluation.decision.reason, 'no_drift');
  });

  it('treats test-only drift as soft_stale', async () => {
    const repoPath = createTempDir('do-what-gate-soft-');
    tempDirs.push(repoPath);
    writeRepoFile(repoPath, 'packages/core/src/a.test.ts', 'export const aTest = true;\n');
    const files = {
      'packages/core/src/a.test.ts': 'hash-test-1',
    };

    const calculator = new BaselineCalculator({
      gitRunner: createFakeGitRunner(files),
      now: () => '2026-03-08T10:00:00.000Z',
      repoPath,
    });
    const surface = createSurface(['packages/core/src/a.test.ts']);
    const branchLock = await calculator.computeBaselineLock(surface, 'run-soft');

    files['packages/core/src/a.test.ts'] = 'hash-test-2';

    const evaluation = await createGate(repoPath, files).canMerge('run-soft', branchLock, surface);
    assert.equal(evaluation.assessment.drift_kind, 'soft_stale');
    assert.equal(evaluation.decision.reason, 'soft_stale_ok');
  });

  it('treats config drift on schema surfaces as soft_stale', async () => {
    const repoPath = createTempDir('do-what-gate-soft-schema-');
    tempDirs.push(repoPath);
    writeRepoFile(repoPath, 'packages/core/tsconfig.json', '{\"compilerOptions\":{\"strict\":true}}\n');
    const files = {
      'packages/core/tsconfig.json': 'hash-config-1',
    };

    const calculator = new BaselineCalculator({
      gitRunner: createFakeGitRunner(files),
      now: () => '2026-03-08T10:00:00.000Z',
      repoPath,
    });
    const surface = createSurface(['packages/core/tsconfig.json'], ['schema_type']);
    const branchLock = await calculator.computeBaselineLock(surface, 'run-soft-schema');

    files['packages/core/tsconfig.json'] = 'hash-config-2';

    const evaluation = await createGate(repoPath, files).canMerge(
      'run-soft-schema',
      branchLock,
      surface,
    );
    assert.equal(evaluation.assessment.drift_kind, 'soft_stale');
    assert.equal(evaluation.decision.reason, 'soft_stale_ok');
  });

  it('treats config drift on config surfaces as soft_stale', async () => {
    const repoPath = createTempDir('do-what-gate-soft-config-');
    tempDirs.push(repoPath);
    writeRepoFile(repoPath, 'packages/core/tsconfig.json', '{\"compilerOptions\":{\"module\":\"NodeNext\"}}\n');
    const files = {
      'packages/core/tsconfig.json': 'hash-config-1',
    };

    const calculator = new BaselineCalculator({
      gitRunner: createFakeGitRunner(files),
      now: () => '2026-03-08T10:00:00.000Z',
      repoPath,
    });
    const surface = createSurface(['packages/core/tsconfig.json'], ['config']);
    const branchLock = await calculator.computeBaselineLock(surface, 'run-soft-config');

    files['packages/core/tsconfig.json'] = 'hash-config-2';

    const evaluation = await createGate(repoPath, files).canMerge(
      'run-soft-config',
      branchLock,
      surface,
    );
    assert.equal(evaluation.assessment.drift_kind, 'soft_stale');
    assert.equal(evaluation.decision.reason, 'soft_stale_ok');
  });

  it('treats source drift as hard_stale and allows one reconcile', async () => {
    const repoPath = createTempDir('do-what-gate-hard-');
    tempDirs.push(repoPath);
    writeRepoFile(repoPath, 'packages/core/src/a.ts', 'export const a = 1;\n');
    const files = {
      'packages/core/src/a.ts': 'hash-source-1',
    };

    const calculator = new BaselineCalculator({
      gitRunner: createFakeGitRunner(files),
      now: () => '2026-03-08T10:00:00.000Z',
      repoPath,
    });
    const surface = createSurface(['packages/core/src/a.ts']);
    const branchLock = await calculator.computeBaselineLock(surface, 'run-hard');

    files['packages/core/src/a.ts'] = 'hash-source-2';

    const evaluation = await createGate(repoPath, files).canMerge('run-hard', branchLock, surface);
    assert.equal(evaluation.assessment.drift_kind, 'hard_stale');
    assert.equal(evaluation.decision.reason, 'hard_stale_reconcile');
  });

  it('serializes on the second hard_stale for schema surfaces', async () => {
    const repoPath = createTempDir('do-what-gate-hard-schema-');
    tempDirs.push(repoPath);
    writeRepoFile(repoPath, 'packages/protocol/src/core/drift.ts', 'export const drift = true;\n');
    const files = {
      'packages/protocol/src/core/drift.ts': 'hash-schema-1',
    };

    const calculator = new BaselineCalculator({
      gitRunner: createFakeGitRunner(files),
      now: () => '2026-03-08T10:00:00.000Z',
      repoPath,
    });
    const surface = createSurface(['packages/protocol/src/core/drift.ts'], ['schema_type']);
    const branchLock = await calculator.computeBaselineLock(surface, 'run-hard-schema');

    files['packages/protocol/src/core/drift.ts'] = 'hash-schema-2';

    const gate = createGate(repoPath, files);
    const first = await gate.canMerge('run-hard-schema', branchLock, surface);
    const second = await gate.canMerge('run-hard-schema', branchLock, surface);

    assert.equal(first.assessment.drift_kind, 'hard_stale');
    assert.equal(first.decision.reason, 'hard_stale_reconcile');
    assert.equal(second.assessment.drift_kind, 'hard_stale');
    assert.equal(second.decision.reason, 'hard_stale_serialize');
  });

  it('serializes on the second hard_stale for config-tagged surfaces', async () => {
    const repoPath = createTempDir('do-what-gate-hard-config-');
    tempDirs.push(repoPath);
    writeRepoFile(repoPath, 'packages/core/src/a.ts', 'export const a = 1;\n');
    const files = {
      'packages/core/src/a.ts': 'hash-source-1',
    };

    const calculator = new BaselineCalculator({
      gitRunner: createFakeGitRunner(files),
      now: () => '2026-03-08T10:00:00.000Z',
      repoPath,
    });
    const surface = createSurface(['packages/core/src/a.ts'], ['config']);
    const branchLock = await calculator.computeBaselineLock(surface, 'run-hard-config');

    files['packages/core/src/a.ts'] = 'hash-source-2';

    const gate = createGate(repoPath, files);
    const first = await gate.canMerge('run-hard-config', branchLock, surface);
    const second = await gate.canMerge('run-hard-config', branchLock, surface);

    assert.equal(first.assessment.drift_kind, 'hard_stale');
    assert.equal(first.decision.reason, 'hard_stale_reconcile');
    assert.equal(second.assessment.drift_kind, 'hard_stale');
    assert.equal(second.decision.reason, 'hard_stale_serialize');
  });
});
