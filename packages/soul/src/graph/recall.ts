import type { CueRef } from '@do-what/protocol';
import type { SoulStateStore } from '../db/soul-state-store.js';
import {
  fetchCueCandidates,
  fetchEdgeCandidates,
  fetchSeedCandidates,
  type GraphCueCandidate,
} from './sql-filter.js';
import { rerankGraphCandidates } from './reranker.js';

const HARD_MAX_NEIGHBORS_PER_SEED = 3;
const HARD_MAX_SEEDS = 5;

export interface GraphRecallRequest {
  max_neighbors_per_seed?: number;
  max_seeds?: number;
  project_id: string;
  rerank_top_k?: number;
  seed_cue_ids: readonly string[];
  timeout_ms?: number;
}

export interface GraphRecallResult {
  graph_ms: number;
  neighbors: CueRef[];
  seeds: CueRef[];
  timeout?: boolean;
  top_k: CueRef[];
}

export class GraphRecallError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GraphRecallError';
  }
}

export class GraphRecallService {
  private readonly stateStore: SoulStateStore;

  constructor(stateStore: SoulStateStore) {
    this.stateStore = stateStore;
  }

  async recall(request: GraphRecallRequest): Promise<GraphRecallResult> {
    const startedAt = Date.now();
    const maxSeeds = request.max_seeds ?? HARD_MAX_SEEDS;
    if (maxSeeds > HARD_MAX_SEEDS) {
      throw new GraphRecallError('max_seeds exceeded');
    }

    const seeds = fetchSeedCandidates(
      this.stateStore,
      request.project_id,
      request.seed_cue_ids.slice(0, maxSeeds),
      maxSeeds,
    );
    const timeoutMs = request.timeout_ms ?? 50;
    const maxNeighborsPerSeed = Math.min(
      request.max_neighbors_per_seed ?? HARD_MAX_NEIGHBORS_PER_SEED,
      HARD_MAX_NEIGHBORS_PER_SEED,
    );
    const neighbors = this.collectNeighbors(
      seeds,
      request.project_id,
      maxNeighborsPerSeed,
      startedAt,
      timeoutMs,
    );
    const topK = rerankGraphCandidates(neighbors, request.rerank_top_k ?? 10, Date.now());

    return {
      graph_ms: Date.now() - startedAt,
      neighbors: neighbors.map((candidate) => ({
        cueId: candidate.cueId,
        gist: candidate.gist,
        pointers: candidate.pointers,
        score: candidate.edgeWeight,
        why: `neighbor of ${candidate.parentCueId}`,
      })),
      seeds: seeds.map((seed) => ({
        cueId: seed.cueId,
        gist: seed.gist,
        pointers: seed.pointers,
        score: seed.activationScore,
        why: 'seed',
      })),
      timeout: Date.now() - startedAt > timeoutMs || undefined,
      top_k: topK.length > 0
        ? topK
        : seeds.slice(0, request.rerank_top_k ?? 10).map((seed) => ({
            cueId: seed.cueId,
            gist: seed.gist,
            pointers: seed.pointers,
            score: seed.activationScore,
            why: 'seed fallback',
          })),
    };
  }

  private collectNeighbors(
    seeds: readonly GraphCueCandidate[],
    projectId: string,
    maxNeighborsPerSeed: number,
    startedAt: number,
    timeoutMs: number,
  ): Array<GraphCueCandidate & { edgeWeight: number; parentCueId: string }> {
    const seedIds = seeds.map((seed) => seed.cueId);
    const seedSet = new Set(seedIds);
    const edges = fetchEdgeCandidates(this.stateStore, seedIds);
    const neighborIds = new Set<string>();
    const perSeedCounts = new Map<string, number>();
    const seedPairs: Array<{ edgeWeight: number; neighborId: string; parentCueId: string }> = [];

    for (const edge of edges) {
      if (Date.now() - startedAt > timeoutMs) {
        break;
      }

      for (const seedId of [edge.sourceId, edge.targetId]) {
        if (!seedSet.has(seedId)) {
          continue;
        }
        const neighborId = seedId === edge.sourceId ? edge.targetId : edge.sourceId;
        if (seedSet.has(neighborId)) {
          continue;
        }

        const count = perSeedCounts.get(seedId) ?? 0;
        if (count >= maxNeighborsPerSeed) {
          continue;
        }

        perSeedCounts.set(seedId, count + 1);
        neighborIds.add(neighborId);
        seedPairs.push({ edgeWeight: edge.weight, neighborId, parentCueId: seedId });
      }
    }

    const cues = fetchCueCandidates(this.stateStore, projectId, [...neighborIds]);
    const cueMap = new Map(cues.map((cue) => [cue.cueId, cue]));
    return seedPairs
      .map((pair) => {
        const cue = cueMap.get(pair.neighborId);
        return cue
          ? {
              ...cue,
              edgeWeight: pair.edgeWeight,
              parentCueId: pair.parentCueId,
            }
          : null;
      })
      .filter(
        (
          candidate,
        ): candidate is GraphCueCandidate & { edgeWeight: number; parentCueId: string } =>
          candidate !== null,
      );
  }
}
