export interface DagRunInput {
  completedAt?: string;
  dependsOnRunIds?: readonly string[];
  depends_on_run_ids?: readonly string[];
  runId: string;
  touchedPaths?: readonly string[];
  touched_paths?: readonly string[];
}

export interface DagEdge {
  from: string;
  to: string;
}

export interface DagBuildResult {
  degraded: boolean;
  edges: readonly DagEdge[];
  order: readonly string[];
}

interface NormalizedRun extends DagRunInput {
  readonly index: number;
  readonly normalizedTouchedPaths: readonly string[];
}

function normalizeTouchedPaths(run: DagRunInput): readonly string[] {
  return run.touchedPaths ?? run.touched_paths ?? [];
}

function normalizeDependencies(run: DagRunInput): readonly string[] {
  return run.dependsOnRunIds ?? run.depends_on_run_ids ?? [];
}

function hasPathOverlap(left: readonly string[], right: readonly string[]): boolean {
  const lookup = new Set(left);
  return right.some((value) => lookup.has(value));
}

export function buildDagPlan(runs: readonly DagRunInput[]): DagBuildResult {
  const normalizedRuns: NormalizedRun[] = [...runs]
    .map((run, index) => ({
      ...run,
      index,
      normalizedTouchedPaths: normalizeTouchedPaths(run),
    }))
    .sort((left, right) => {
      if (left.completedAt && right.completedAt) {
        if (left.completedAt === right.completedAt) {
          return left.index - right.index;
        }
        return left.completedAt.localeCompare(right.completedAt);
      }
      return left.index - right.index;
    });

  const adjacency = new Map<string, Set<string>>();
  const indegree = new Map<string, number>();
  const stableOrder = new Map<string, number>();
  const edges: DagEdge[] = [];

  for (const run of normalizedRuns) {
    adjacency.set(run.runId, new Set<string>());
    indegree.set(run.runId, 0);
    stableOrder.set(run.runId, stableOrder.size);
  }

  for (let index = 0; index < normalizedRuns.length; index += 1) {
    const current = normalizedRuns[index];

    for (const dependency of normalizeDependencies(current)) {
      if (!adjacency.has(dependency)) {
        continue;
      }

      const targets = adjacency.get(dependency) as Set<string>;
      if (!targets.has(current.runId)) {
        targets.add(current.runId);
        indegree.set(current.runId, (indegree.get(current.runId) ?? 0) + 1);
        edges.push({ from: dependency, to: current.runId });
      }
    }

    for (let nextIndex = index + 1; nextIndex < normalizedRuns.length; nextIndex += 1) {
      const next = normalizedRuns[nextIndex];
      if (!hasPathOverlap(current.normalizedTouchedPaths, next.normalizedTouchedPaths)) {
        continue;
      }

      const targets = adjacency.get(current.runId) as Set<string>;
      if (targets.has(next.runId)) {
        continue;
      }

      targets.add(next.runId);
      indegree.set(next.runId, (indegree.get(next.runId) ?? 0) + 1);
      edges.push({ from: current.runId, to: next.runId });
    }
  }

  const ready = normalizedRuns
    .filter((run) => (indegree.get(run.runId) ?? 0) === 0)
    .sort((left, right) =>
      (stableOrder.get(left.runId) ?? 0) - (stableOrder.get(right.runId) ?? 0),
    );
  const order: string[] = [];

  while (ready.length > 0) {
    const current = ready.shift() as NormalizedRun;
    order.push(current.runId);

    for (const nextRunId of adjacency.get(current.runId) ?? []) {
      const nextDegree = (indegree.get(nextRunId) ?? 0) - 1;
      indegree.set(nextRunId, nextDegree);
      if (nextDegree === 0) {
        const nextRun = normalizedRuns.find((item) => item.runId === nextRunId);
        if (nextRun) {
          ready.push(nextRun);
          ready.sort((left, right) =>
            (stableOrder.get(left.runId) ?? 0) - (stableOrder.get(right.runId) ?? 0),
          );
        }
      }
    }
  }

  if (order.length !== normalizedRuns.length) {
    return {
      degraded: true,
      edges,
      order: normalizedRuns.map((run) => run.runId),
    };
  }

  return {
    degraded: false,
    edges,
    order,
  };
}

export function buildDAG(runs: readonly DagRunInput[]): string[] {
  return [...buildDagPlan(runs).order];
}
