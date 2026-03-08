import type {
  ArtifactKind,
  ConflictConclusion,
  ConflictKind,
  FocusSurface,
  GovernanceLease,
  InvalidationCondition,
} from '@do-what/protocol';

const GLOB_CHARS = /[*?]/;
const REGEX_SPECIAL_CHARS = /[.+^${}()|[\]\\]/g;

export function normalizeRepoPath(value: string): string {
  return value.replace(/\\/g, '/').replace(/^\.\//, '').replace(/^\/+/, '');
}

export function uniqueSortedPaths(values: readonly string[]): string[] {
  return [...new Set(values.map(normalizeRepoPath).filter((value) => value.length > 0))].sort(
    (left, right) => left.localeCompare(right),
  );
}

export function inferArtifactKind(filePath: string): ArtifactKind {
  const normalized = normalizeRepoPath(filePath).toLowerCase();
  if (
    normalized.includes('/migrations/')
    || normalized.endsWith('.sql')
    || normalized.endsWith('-migration.ts')
  ) {
    return 'migration';
  }
  if (
    normalized.includes('/schema/')
    || normalized.includes('/schemas/')
    || normalized.endsWith('.schema.ts')
    || normalized.includes('/protocol/src/')
  ) {
    return 'schema_type';
  }
  if (
    normalized.endsWith('.test.ts')
    || normalized.endsWith('.spec.ts')
    || normalized.includes('/__tests__/')
  ) {
    return 'test_file';
  }
  if (
    normalized.endsWith('.json')
    || normalized.endsWith('.yaml')
    || normalized.endsWith('.yml')
    || normalized.endsWith('.toml')
    || normalized.endsWith('.ini')
    || normalized.endsWith('.config.ts')
    || normalized.endsWith('.config.js')
    || normalized.endsWith('package.json')
    || normalized.endsWith('tsconfig.json')
  ) {
    return 'config';
  }
  return 'source_file';
}

export function derivePackageScope(paths: readonly string[]): string[] {
  const packages = new Set<string>();
  for (const normalizedPath of uniqueSortedPaths(paths)) {
    const match = /^packages\/([^/]+)/.exec(normalizedPath);
    if (match?.[1]) {
      packages.add(`@do-what/${match[1]}`);
    }
  }
  return [...packages].sort((left, right) => left.localeCompare(right));
}

function globToRegExp(pattern: string): RegExp {
  const normalized = normalizeRepoPath(pattern);
  const escaped = normalized.replace(REGEX_SPECIAL_CHARS, '\\$&');
  const regex = escaped
    .replace(/\\\*\\\*/g, '.*')
    .replace(/\\\*/g, '[^/]*')
    .replace(/\\\?/g, '.');
  return new RegExp(`^${regex}$`);
}

export function matchesGlob(pattern: string, filePath: string): boolean {
  const normalizedPattern = normalizeRepoPath(pattern);
  const normalizedPath = normalizeRepoPath(filePath);
  if (!GLOB_CHARS.test(normalizedPattern)) {
    return normalizedPattern === normalizedPath;
  }
  return globToRegExp(normalizedPattern).test(normalizedPath);
}

function patternsOverlap(left: string, right: string): boolean {
  const normalizedLeft = normalizeRepoPath(left);
  const normalizedRight = normalizeRepoPath(right);
  if (normalizedLeft === normalizedRight) {
    return true;
  }
  if (GLOB_CHARS.test(normalizedLeft) && !GLOB_CHARS.test(normalizedRight)) {
    return matchesGlob(normalizedLeft, normalizedRight);
  }
  if (!GLOB_CHARS.test(normalizedLeft) && GLOB_CHARS.test(normalizedRight)) {
    return matchesGlob(normalizedRight, normalizedLeft);
  }
  return false;
}

export function findSurfaceOverlap(
  left: FocusSurface,
  right: FocusSurface,
): string[] {
  const overlaps = new Set<string>();
  for (const leftPath of left.path_globs) {
    for (const rightPath of right.path_globs) {
      if (patternsOverlap(leftPath, rightPath)) {
        overlaps.add(normalizeRepoPath(GLOB_CHARS.test(leftPath) ? rightPath : leftPath));
      }
    }
  }
  return [...overlaps].sort((a, b) => a.localeCompare(b));
}

export function isShadowedSurface(surface: FocusSurface, other: FocusSurface): boolean {
  const sourcePaths = uniqueSortedPaths(surface.path_globs);
  const otherPaths = uniqueSortedPaths(other.path_globs);
  if (sourcePaths.length === 0 || otherPaths.length === 0) {
    return false;
  }
  return sourcePaths.every((candidatePath) =>
    otherPaths.some((otherPath) => patternsOverlap(candidatePath, otherPath)),
  );
}

function surfaceArtifactKinds(surface: FocusSurface): Set<ArtifactKind> {
  if (surface.artifact_kind.length > 0) {
    return new Set(surface.artifact_kind);
  }
  return new Set(surface.path_globs.map((filePath) => inferArtifactKind(filePath)));
}

export function determineConflictKind(
  left: FocusSurface,
  right: FocusSurface,
): ConflictKind | null {
  const overlaps = findSurfaceOverlap(left, right);
  if (overlaps.length === 0) {
    return null;
  }

  const kinds = new Set<ArtifactKind>([
    ...surfaceArtifactKinds(left),
    ...surfaceArtifactKinds(right),
    ...overlaps.map((filePath) => inferArtifactKind(filePath)),
  ]);
  if (kinds.has('migration')) {
    return 'migration_conflict';
  }
  if (kinds.has('schema_type')) {
    return 'schema_conflict';
  }
  return 'path_overlap';
}

export function buildConflictConclusions(
  surface: FocusSurface,
  activeLeases: readonly GovernanceLease[],
): ConflictConclusion[] {
  const conclusions: ConflictConclusion[] = [];
  for (const lease of activeLeases) {
    const conflictKind = determineConflictKind(surface, lease.valid_snapshot);
    if (!conflictKind) {
      continue;
    }
    conclusions.push({
      conflicting_surface_ids: [lease.surface_id],
      conflict_kind: conflictKind,
      resolution:
        conflictKind === 'path_overlap'
          ? 'allow_soft'
          : 'block',
    });
  }
  return conclusions;
}

export function deriveInvalidationConditions(
  surface: FocusSurface,
): InvalidationCondition[] {
  const paths = uniqueSortedPaths(surface.path_globs);
  if (paths.length === 0) {
    return [];
  }

  const conditions: InvalidationCondition[] = [
    {
      affected_paths: paths,
      trigger: 'main_commit',
    },
  ];
  const kinds = surfaceArtifactKinds(surface);
  if (kinds.has('schema_type')) {
    conditions.push({
      affected_paths: paths,
      trigger: 'schema_change',
    });
  }
  if (kinds.has('migration')) {
    conditions.push({
      affected_paths: paths,
      trigger: 'migration_added',
    });
  }
  return conditions;
}

export function shouldInvalidateLease(
  lease: GovernanceLease,
  changedPaths: readonly string[],
): boolean {
  const normalizedChangedPaths = uniqueSortedPaths(changedPaths);
  if (normalizedChangedPaths.length === 0) {
    return false;
  }

  return lease.invalidation_conditions.some((condition) =>
    condition.affected_paths.some((pattern) =>
      normalizedChangedPaths.some((changedPath) => matchesGlob(pattern, changedPath)),
    ),
  );
}
