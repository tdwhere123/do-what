export interface PointerComponents {
  extras: Record<string, string>;
  gitCommit?: string;
  repoPath?: string;
  snippetHash?: string;
  symbol?: string;
}

const POINTER_KEY_MAP = {
  git_commit: 'gitCommit',
  repo_path: 'repoPath',
  snippet_hash: 'snippetHash',
  symbol: 'symbol',
} as const;

export function parsePointer(pointer: string): PointerComponents {
  const components: PointerComponents = { extras: {} };

  for (const segment of pointer.trim().split(/\s+/)) {
    if (segment.length === 0) {
      continue;
    }

    const separatorIndex = segment.indexOf(':');
    if (separatorIndex <= 0) {
      continue;
    }

    const rawKey = segment.slice(0, separatorIndex);
    const value = segment.slice(separatorIndex + 1);
    if (!value) {
      continue;
    }

    const mappedKey = POINTER_KEY_MAP[rawKey as keyof typeof POINTER_KEY_MAP];
    if (mappedKey) {
      components[mappedKey] = value;
      continue;
    }

    components.extras[rawKey] = value;
  }

  if (
    !components.gitCommit
    && !components.repoPath
    && !components.symbol
    && !components.snippetHash
    && Object.keys(components.extras).length === 0
  ) {
    throw new Error(`invalid pointer: ${pointer}`);
  }

  return components;
}
