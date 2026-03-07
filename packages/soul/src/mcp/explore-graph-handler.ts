import type { CueRef } from '@do-what/protocol';
import { SoulToolsSchemas } from '@do-what/protocol';
import { TABLE_MEMORY_CUES, TABLE_MEMORY_GRAPH_EDGES } from '../db/schema.js';
import type { SoulStateStore } from '../db/soul-state-store.js';
import { parseStringArray } from '../utils/json.js';
import { createMemoryEvent, publishMemoryEvent } from './events.js';
import type { SoulEventPublisher } from './types.js';
import { SoulToolValidationError } from './types.js';

interface GraphCueRow {
  confidence: number;
  cue_id: string;
  gist: string;
  pointers: string;
}

interface GraphEdgeRow {
  confidence: number;
  edge_id: string;
  relation: string;
  source_id: string;
  target_id: string;
  track: string | null;
}

export interface ExploreGraphHandlerOptions {
  publishEvent?: SoulEventPublisher;
  stateStore: SoulStateStore;
}

function toCueRef(row: GraphCueRow): CueRef {
  return {
    cueId: row.cue_id,
    gist: row.gist,
    pointers: parseStringArray(row.pointers),
    score: row.confidence,
    why: 'graph traversal',
  };
}

function fetchSeedIds(
  stateStore: SoulStateStore,
  entityName: string,
  track: string,
): string[] {
  return stateStore.read(
    (db) =>
      (
        db
          .prepare(
            `SELECT cue_id
             FROM ${TABLE_MEMORY_CUES}
             WHERE track = ?
               AND EXISTS (
                 SELECT 1
                 FROM json_each(${TABLE_MEMORY_CUES}.anchors)
                 WHERE LOWER(value) = LOWER(?)
               )`,
          )
          .all(track, entityName) as Array<{ cue_id: string }>
      ).map((row) => row.cue_id),
    [] as string[],
  );
}

function fetchEdges(
  stateStore: SoulStateStore,
  cueIds: readonly string[],
  track: string,
): GraphEdgeRow[] {
  if (cueIds.length === 0) {
    return [];
  }

  const placeholders = cueIds.map(() => '?').join(', ');
  return stateStore.read(
    (db) =>
      db
        .prepare(
          `SELECT edge_id, source_id, target_id, relation, confidence, track
           FROM ${TABLE_MEMORY_GRAPH_EDGES}
           WHERE track = ?
             AND (source_id IN (${placeholders}) OR target_id IN (${placeholders}))`,
        )
        .all(track, ...cueIds, ...cueIds) as GraphEdgeRow[],
    [] as GraphEdgeRow[],
  );
}

function fetchCues(stateStore: SoulStateStore, cueIds: readonly string[]): CueRef[] {
  if (cueIds.length === 0) {
    return [];
  }

  const placeholders = cueIds.map(() => '?').join(', ');
  return stateStore.read(
    (db) =>
      (
        db
          .prepare(
            `SELECT cue_id, gist, pointers, confidence
             FROM ${TABLE_MEMORY_CUES}
             WHERE cue_id IN (${placeholders})`,
          )
          .all(...cueIds) as GraphCueRow[]
      ).map(toCueRef),
    [] as CueRef[],
  );
}

export function createExploreGraphHandler(options: ExploreGraphHandlerOptions) {
  return async function handleExploreGraph(arguments_: unknown): Promise<unknown> {
    const parsed = SoulToolsSchemas['soul.explore_graph'].safeParse(arguments_);
    if (!parsed.success) {
      throw new SoulToolValidationError(
        'Invalid soul.explore_graph arguments',
        parsed.error.issues,
      );
    }

    const seedIds = fetchSeedIds(
      options.stateStore,
      parsed.data.entity_name,
      parsed.data.track,
    );
    const visited = new Set(seedIds);
    const edges = new Map<string, GraphEdgeRow>();
    let frontier = [...seedIds];

    for (let depth = 0; depth < parsed.data.depth && frontier.length > 0; depth += 1) {
      const nextFrontier = new Set<string>();
      for (const edge of fetchEdges(options.stateStore, frontier, parsed.data.track)) {
        edges.set(edge.edge_id, edge);
        for (const candidateId of [edge.source_id, edge.target_id]) {
          if (visited.size >= parsed.data.limit) {
            break;
          }
          if (!visited.has(candidateId)) {
            visited.add(candidateId);
            nextFrontier.add(candidateId);
          }
        }
      }
      frontier = [...nextFrontier];
    }

    const nodes = fetchCues(options.stateStore, [...visited]);
    publishMemoryEvent(
      options.publishEvent,
      createMemoryEvent({
        budgetUsed: 0,
        operation: 'search',
        query: `graph:${parsed.data.entity_name}`,
        results: nodes,
      }),
    );

    return {
      edges: [...edges.values()],
      nodes,
    };
  };
}
