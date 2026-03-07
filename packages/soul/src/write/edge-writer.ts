import { randomUUID } from 'node:crypto';
import { TABLE_MEMORY_CUES, TABLE_MEMORY_GRAPH_EDGES } from '../db/schema.js';
import type { SoulStateStore } from '../db/soul-state-store.js';
import type { SoulWorkerClient } from '../db/worker-client.js';
import {
  normalizeCueDraft,
  normalizeEdgeDrafts,
} from './draft-normalizer.js';

export interface EdgeWriterInput {
  cueDraft: Record<string, unknown>;
  cueId: string;
  edgeDrafts: readonly Record<string, unknown>[];
  projectId: string;
}

export interface EdgeWriterOptions {
  stateStore: SoulStateStore;
  writer: SoulWorkerClient;
}

interface ResolvedEdge {
  confidence: number;
  createdAt: string;
  edgeId: string;
  evidence: string | null;
  relation: string;
  sourceId: string;
  targetId: string;
  track: string | null;
}

export class EdgeWriter {
  private readonly stateStore: SoulStateStore;
  private readonly writer: SoulWorkerClient;

  constructor(options: EdgeWriterOptions) {
    this.stateStore = options.stateStore;
    this.writer = options.writer;
  }

  async insertOrIgnore(input: EdgeWriterInput): Promise<number> {
    const cueAnchors = normalizeCueDraft(input.cueDraft, 'working').anchors;
    const resolvedEdges = normalizeEdgeDrafts(input.edgeDrafts)
      .map((edgeDraft) => this.resolveEdge(input.projectId, input.cueId, cueAnchors, edgeDraft))
      .filter((edge): edge is ResolvedEdge => edge !== null);
    if (resolvedEdges.length === 0) {
      return 0;
    }

    const placeholders = resolvedEdges.map(() => '(?, ?, ?, ?, ?, ?, ?, ?)').join(', ');
    const params = resolvedEdges.flatMap((edge) => [
      edge.edgeId,
      edge.sourceId,
      edge.targetId,
      edge.relation,
      edge.track,
      edge.confidence,
      edge.evidence,
      edge.createdAt,
    ]);
    await this.writer.write({
      params,
      sql: `INSERT OR IGNORE INTO ${TABLE_MEMORY_GRAPH_EDGES} (
              edge_id,
              source_id,
              target_id,
              relation,
              track,
              confidence,
              evidence,
              created_at
            )
            VALUES ${placeholders}`,
    });
    return resolvedEdges.length;
  }

  private resolveCueId(projectId: string, anchor: string): string | null {
    return this.stateStore.read(
      (db) =>
        (
          db
            .prepare(
              `SELECT cue_id
               FROM ${TABLE_MEMORY_CUES}
               WHERE project_id = ?
                 AND EXISTS (
                   SELECT 1
                   FROM json_each(${TABLE_MEMORY_CUES}.anchors)
                   WHERE LOWER(value) = LOWER(?)
                 )
               LIMIT 1`,
            )
            .get(projectId, anchor) as { cue_id?: string } | undefined
        )?.cue_id ?? null,
      null,
    );
  }

  private resolveEdge(
    projectId: string,
    cueId: string,
    cueAnchors: readonly string[],
    edgeDraft: ReturnType<typeof normalizeEdgeDrafts>[number],
  ): ResolvedEdge | null {
    const sourceId = this.resolveEndpoint(
      projectId,
      cueId,
      cueAnchors,
      edgeDraft.sourceId,
      edgeDraft.sourceAnchor,
    );
    const targetId = this.resolveEndpoint(
      projectId,
      cueId,
      cueAnchors,
      edgeDraft.targetId,
      edgeDraft.targetAnchor,
    );
    if (!sourceId || !targetId) {
      return null;
    }

    return {
      confidence: edgeDraft.confidence,
      createdAt: new Date().toISOString(),
      edgeId: randomUUID(),
      evidence: edgeDraft.evidence,
      relation: edgeDraft.relation,
      sourceId,
      targetId,
      track: edgeDraft.track,
    };
  }

  private resolveEndpoint(
    projectId: string,
    cueId: string,
    cueAnchors: readonly string[],
    directId: string | null,
    anchor: string | null,
  ): string | null {
    if (directId) {
      return directId;
    }

    if (!anchor || anchor === 'self' || cueAnchors.includes(anchor)) {
      return cueId;
    }

    return this.resolveCueId(projectId, anchor);
  }
}
