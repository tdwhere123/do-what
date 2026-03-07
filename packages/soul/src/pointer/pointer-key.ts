import { createHash } from 'node:crypto';
import type { PointerComponents } from './pointer-parser.js';

function toEntries(components: PointerComponents): Array<[string, string]> {
  const entries: Array<[string, string]> = [];

  if (components.gitCommit) {
    entries.push(['git_commit', components.gitCommit]);
  }
  if (components.repoPath) {
    entries.push(['repo_path', components.repoPath]);
  }
  if (components.snippetHash) {
    entries.push(['snippet_hash', components.snippetHash]);
  }
  if (components.symbol) {
    entries.push(['symbol', components.symbol]);
  }

  for (const [key, value] of Object.entries(components.extras)) {
    entries.push([key, value]);
  }

  return entries.sort(([left], [right]) => left.localeCompare(right));
}

export function normalizePointerComponents(components: PointerComponents): string {
  return toEntries(components)
    .map(([key, value]) => `${key}:${value}`)
    .join(' ');
}

export function generatePointerKey(components: PointerComponents): string {
  return createHash('sha256')
    .update(normalizePointerComponents(components))
    .digest('hex');
}
