function escapeRegExp(input: string): string {
  return input.replace(/[.+^${}()|[\]\\]/g, '\\$&');
}

function globToRegExp(pattern: string): RegExp {
  const doubleStarToken = '__DO_WHAT_DOUBLE_STAR__';
  const singleStarToken = '__DO_WHAT_SINGLE_STAR__';
  const normalized = normalizePath(pattern);
  const tokenized = normalized
    .replace(/\*\*/g, doubleStarToken)
    .replace(/\*/g, singleStarToken);
  const escaped = escapeRegExp(tokenized)
    .replace(new RegExp(doubleStarToken, 'g'), '::DOUBLE_STAR::')
    .replace(new RegExp(singleStarToken, 'g'), '::SINGLE_STAR::')
    .replace(/::DOUBLE_STAR::/g, '.*');
  const withSingleStar = escaped.replace(/::SINGLE_STAR::/g, '[^/]*');
  return new RegExp(`^${withSingleStar}$`, 'i');
}

export function normalizePath(path: string): string {
  return path.replace(/\\/g, '/');
}

export function matchPath(pattern: string, targetPath: string): boolean {
  return globToRegExp(pattern).test(normalizePath(targetPath));
}

export function matchPathList(
  patterns: readonly string[] | undefined,
  targetPath: string,
): boolean {
  if (!patterns || patterns.length === 0) {
    return false;
  }
  return patterns.some((pattern) => matchPath(pattern, targetPath));
}

export function matchCommand(
  allowCommands: readonly string[] | undefined,
  command: string,
): boolean {
  if (!allowCommands || allowCommands.length === 0) {
    return false;
  }
  const normalizedCommand = command.trim();
  return allowCommands.some((candidate) => {
    const normalizedCandidate = candidate.trim();
    if (normalizedCandidate.length === 0) {
      return false;
    }
    return (
      normalizedCommand === normalizedCandidate ||
      normalizedCommand.startsWith(`${normalizedCandidate} `)
    );
  });
}

export function matchDomain(
  allowDomains: readonly string[] | undefined,
  url: string,
): boolean {
  if (!allowDomains || allowDomains.length === 0) {
    return false;
  }

  let hostname: string;
  try {
    hostname = new URL(url).hostname.toLowerCase();
  } catch {
    return false;
  }

  return allowDomains.some((domain) => {
    const normalizedDomain = domain.toLowerCase();
    return (
      hostname === normalizedDomain ||
      hostname.endsWith(`.${normalizedDomain}`)
    );
  });
}
