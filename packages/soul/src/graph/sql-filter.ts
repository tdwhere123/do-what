import type { CueRef } from '@do-what/protocol';
import { TABLE_MEMORY_CUES, TABLE_MEMORY_GRAPH_EDGES } from '../db/schema.js';
import type { SoulStateStore } from '../db/soul-state-store.js';
import { parseStringArray } from '../utils/json.js';

interface CueRow {
  activation_score: number;
  cue_id: string;
  gist: string;
  pointers: string;
  updated_at: string;
}

interface EdgeRow {
  confidence: number;
  edge_id: string;
  source_id: string;
  target_id: string;
}

export interface GraphCueCandidate extends CueRef {
  activationScore: number;
  updatedAt: string;
}

export interface GraphEdgeCandidate {
  edgeId: string;
  sourceId: string;
  targetId: string;
  weight: number;
}

function mapCueRow(row: CueRow): GraphCueCandidate {
  return {
    activationScore: row.activation_score ?? 0,
    cueId: row.cue_id,
    gist: row.gist,
    pointers: parseStringArray(row.pointers),
    score: row.activation_score ?? 0,
    updatedAt: row.updated_at,
    why: 'graph seed',
  };
}

export function fetchSeedCandidates(
  stateStore: SoulStateStore,
  projectId: string,
  cueIds: readonly string[],
  maxSeeds: number,
): GraphCueCandidate[] {
  if (cueIds.length === 0) {
    return [];
  }

  const placeholders = cueIds.map(() => '?').join(', ');
  return stateStore.read(
    (db) =>
      (
        db
          .prepare(
            `SELECT cue_id, gist, pointers, activation_score, updated_at
             FROM ${TABLE_MEMORY_CUES}
             WHERE project_id = ?
               AND cue_id IN (${placeholders})
               AND COALESCE(pruned, 0) = 0
             ORDER BY activation_score DESC, updated_at DESC
             LIMIT ?`,
          )
          .all(projectId, ...cueIds, maxSeeds) as CueRow[]
      ).map(mapCueRow),
    [] as GraphCueCandidate[],
  );
}

export function fetchEdgeCandidates(
  stateStore: SoulStateStore,
  cueIds: readonly string[],
): GraphEdgeCandidate[] {
  if (cueIds.length === 0) {
    return [];
  }

  const placeholders = cueIds.map(() => '?').join(', ');
  return stateStore.read(
    (db) =>
      (
        db
          .prepare(
            `SELECT edge_id, source_id, target_id, confidence
             FROM ${TABLE_MEMORY_GRAPH_EDGES}
             WHERE source_id IN (${placeholders})
                OR target_id IN (${placeholders})
             ORDER BY confidence DESC, created_at DESC`,
          )
          .all(...cueIds, ...cueIds) as EdgeRow[]
      ).map((row) => ({
        edgeId: row.edge_id,
        sourceId: row.source_id,
        targetId: row.target_id,
        weight: row.confidence ?? 0.5,
      })),
    [] as GraphEdgeCandidate[],
  );
}

export function fetchCueCandidates(
  stateStore: SoulStateStore,
  projectId: string,
  cueIds: readonly string[],
): GraphCueCandidate[] {
  if (cueIds.length === 0) {
    return [];
  }

  const placeholders = cueIds.map(() => '?').join(', ');
  return stateStore.read(
    (db) =>
      (
        db
          .prepare(
            `SELECT cue_id, gist, pointers, activation_score, updated_at
             FROM ${TABLE_MEMORY_CUES}
             WHERE project_id = ?
               AND cue_id IN (${placeholders})
               AND COALESCE(pruned, 0) = 0`,
          )
          .all(projectId, ...cueIds) as CueRow[]
      ).map(mapCueRow),
    [] as GraphCueCandidate[],
  );
}
