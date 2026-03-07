import { createHash } from 'node:crypto';
import path from 'node:path';
import { runProcess } from './git-process.js';

const FINGERPRINT_HEX_LENGTH = 32;

export interface ProjectFingerprint {
  fingerprint: string;
  primaryKey: string | null;
  secondaryKey: string;
}

function hashValue(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, FINGERPRINT_HEX_LENGTH);
}

async function getGitOutput(
  workspacePath: string,
  args: readonly string[],
): Promise<string | null> {
  const result = await runProcess({
    args,
    command: 'git',
    cwd: workspacePath,
  });
  if (result.code !== 0 || result.stdout.length === 0) {
    return null;
  }

  return result.stdout;
}

async function resolveDefaultBranch(workspacePath: string): Promise<string | null> {
  const symbolicRef = await getGitOutput(workspacePath, [
    'symbolic-ref',
    'refs/remotes/origin/HEAD',
  ]);
  if (symbolicRef) {
    const branch = symbolicRef.split('/').pop();
    if (branch) {
      return branch;
    }
  }

  return getGitOutput(workspacePath, ['branch', '--show-current']);
}

export async function computePrimary(workspacePath: string): Promise<string | null> {
  const remoteUrl = await getGitOutput(workspacePath, ['remote', 'get-url', 'origin']);
  const branch = await resolveDefaultBranch(workspacePath);
  if (!remoteUrl || !branch) {
    return null;
  }

  return hashValue(`${remoteUrl}#${branch}`);
}

export function computeSecondary(workspacePath: string): string {
  return hashValue(path.resolve(workspacePath));
}

export async function describeFingerprint(
  workspacePath: string,
): Promise<ProjectFingerprint> {
  const primaryKey = await computePrimary(workspacePath);
  const secondaryKey = computeSecondary(workspacePath);
  return {
    fingerprint: primaryKey ?? secondaryKey,
    primaryKey,
    secondaryKey,
  };
}

export async function getFingerprint(workspacePath: string): Promise<string> {
  const fingerprint = await describeFingerprint(workspacePath);
  return fingerprint.fingerprint;
}
