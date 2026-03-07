import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { runProcess } from '../repo/git-process.js';
import {
  computePrimary,
  computeSecondary,
  getFingerprint,
} from '../repo/project-fingerprint.js';

const tempDirs: string[] = [];

function createTempDir(): string {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'do-what-fingerprint-'));
  tempDirs.push(tempDir);
  return tempDir;
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const tempDir = tempDirs.pop();
    if (tempDir) {
      fs.rmSync(tempDir, { force: true, recursive: true });
    }
  }
});

describe('project fingerprint', () => {
  it('prefers the primary fingerprint when git remote metadata is available', async () => {
    const workspaceRoot = createTempDir();
    await runProcess({
      args: ['init', '--initial-branch=main'],
      command: 'git',
      cwd: workspaceRoot,
    });
    await runProcess({
      args: ['remote', 'add', 'origin', 'https://example.com/acme/do-what.git'],
      command: 'git',
      cwd: workspaceRoot,
    });

    const primary = await computePrimary(workspaceRoot);
    const fingerprint = await getFingerprint(workspaceRoot);

    assert.ok(primary);
    assert.equal(primary?.length, 32);
    assert.equal(fingerprint, primary);
  });

  it('falls back to the secondary fingerprint outside git repositories', async () => {
    const workspaceRoot = createTempDir();

    const fingerprint = await getFingerprint(workspaceRoot);
    const secondary = computeSecondary(workspaceRoot);

    assert.equal(fingerprint, secondary);
    assert.equal(secondary.length, 32);
  });
});
