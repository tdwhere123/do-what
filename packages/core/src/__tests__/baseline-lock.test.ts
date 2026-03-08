import assert from 'node:assert/strict';
import fs from 'node:fs';
import { afterEach, describe, it } from 'node:test';
import type { FocusSurface } from '@do-what/protocol';
import { BaselineCalculator } from '../governance/baseline-calculator.js';
import { createTempDir } from './git-fixture.js';

const tempDirs: string[] = [];

function createSurface(pathGlobs: readonly string[]): FocusSurface {
  return {
    artifact_kind: pathGlobs.map((filePath) =>
      filePath.endsWith('.test.ts') ? 'test_file' : 'source_file',
    ),
    baseline_fingerprint: 'pending',
    created_at: '2026-03-08T10:00:00.000Z',
    package_scope: ['@do-what/core'],
    path_globs: [...pathGlobs],
    surface_id: 'surface-1',
    workspace_id: 'ws-1',
  };
}

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

afterEach(() => {
  while (tempDirs.length > 0) {
    const tempDir = tempDirs.pop();
    if (tempDir) {
      fs.rmSync(tempDir, { force: true, recursive: true });
    }
  }
});

describe('baseline-lock', () => {
  it('computes idempotent fingerprints for the same tracked file set', async () => {
    const repoPath = createTempDir('do-what-baseline-');
    tempDirs.push(repoPath);
    writeRepoFile(repoPath, 'packages/core/src/a.ts', 'export const a = 1;\n');
    writeRepoFile(repoPath, 'packages/core/src/a.test.ts', 'export const aTest = true;\n');

    const calculator = new BaselineCalculator({
      gitRunner: createFakeGitRunner({
        'packages/core/src/a.test.ts': 'hash-test',
        'packages/core/src/a.ts': 'hash-source',
      }),
      now: () => '2026-03-08T10:00:00.000Z',
      repoPath,
    });
    const surface = createSurface([
      'packages/core/src/a.ts',
      'packages/core/src/a.test.ts',
    ]);

    const first = await calculator.computeBaselineLock(surface, 'run-1');
    const second = await calculator.computeBaselineLock(surface, 'run-1');

    assert.equal(first.baseline_fingerprint, second.baseline_fingerprint);
    assert.deepEqual(
      first.files_snapshot.map((snapshot) => snapshot.path),
      ['packages/core/src/a.test.ts', 'packages/core/src/a.ts'],
    );
  });

  it('captures only files that match the declared surface paths', async () => {
    const repoPath = createTempDir('do-what-baseline-filter-');
    tempDirs.push(repoPath);
    writeRepoFile(repoPath, 'packages/core/src/a.ts', 'export const a = 1;\n');
    writeRepoFile(repoPath, 'packages/core/src/b.ts', 'export const b = 2;\n');

    const calculator = new BaselineCalculator({
      gitRunner: createFakeGitRunner({
        'packages/core/src/a.ts': 'hash-a',
        'packages/core/src/b.ts': 'hash-b',
      }),
      now: () => '2026-03-08T10:00:00.000Z',
      repoPath,
    });
    const lock = await calculator.computeBaselineLock(
      createSurface(['packages/core/src/a.ts']),
      'run-2',
    );

    assert.deepEqual(
      lock.files_snapshot.map((snapshot) => snapshot.path),
      ['packages/core/src/a.ts'],
    );
  });
});
