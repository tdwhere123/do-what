import { createHash } from 'node:crypto';

export function computeContextFingerprint(
  repoPath: string,
  gitCommit: string,
  symbol?: string,
): string {
  return createHash('sha256')
    .update(`${repoPath}:${gitCommit}:${symbol ?? ''}`)
    .digest('hex');
}
