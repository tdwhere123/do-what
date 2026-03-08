import { randomUUID } from 'node:crypto';
import type { CueRow } from '../db/schema.js';
import { TABLE_MEMORY_CUES } from '../db/schema.js';
import type { SoulStateStore } from '../db/soul-state-store.js';
import type { SoulWorkerClient } from '../db/worker-client.js';
import { stableStringify } from '../utils/json.js';
import {
  normalizeCueDraft,
  type CueImpactLevel,
} from './draft-normalizer.js';

export interface CueWriteInput {
  confidence: number;
  cueDraft: Record<string, unknown>;
  impactLevel: CueImpactLevel;
  projectId: string;
}

export interface CueWriteResult {
  cueId: string;
  impactLevel: CueImpactLevel;
  inserted: boolean;
}

export interface CueWriterOptions {
  stateStore: SoulStateStore;
  writer: SoulWorkerClient;
}

interface ExistingCueSummary {
  cue_id: string;
  hit_count: number;
  impact_level: string;
}

const IMPACT_LEVEL_ORDER: Record<CueImpactLevel, number> = {
  canon: 2,
  consolidated: 1,
  working: 0,
};

export class CueWriter {
  private readonly stateStore: SoulStateStore;
  private readonly writer: SoulWorkerClient;

  constructor(options: CueWriterOptions) {
    this.stateStore = options.stateStore;
    this.writer = options.writer;
  }

  async upsert(input: CueWriteInput): Promise<CueWriteResult> {
    const normalizedCue = normalizeCueDraft(input.cueDraft, input.impactLevel);
    const anchorsJson = stableStringify(normalizedCue.anchors);
    const existing = this.findExistingCue(input.projectId, normalizedCue.source, anchorsJson);
    const nextImpactLevel = this.resolveImpactLevel(
      existing?.impact_level,
      normalizedCue.impactLevel,
      normalizedCue.pointers.length,
      existing?.hit_count ?? 0,
    );
    const cueId = existing?.cue_id ?? randomUUID();
    const now = new Date().toISOString();

    if (existing) {
      await this.writer.write({
        params: [
          normalizedCue.gist,
          normalizedCue.summary,
          normalizedCue.formationKind,
          normalizedCue.dimension,
          normalizedCue.scope,
          normalizedCue.domainTags.length > 0 ? stableStringify(normalizedCue.domainTags) : null,
          nextImpactLevel,
          normalizedCue.track,
          anchorsJson,
          stableStringify(normalizedCue.pointers),
          normalizedCue.evidenceRefs.length > 0
            ? stableStringify(normalizedCue.evidenceRefs)
            : null,
          normalizedCue.focusSurface,
          normalizedCue.activationScore,
          normalizedCue.retentionScore,
          normalizedCue.manifestationState,
          normalizedCue.retentionState,
          normalizedCue.decayProfile,
          normalizedCue.confidence ?? input.confidence,
          normalizedCue.metadata,
          now,
          cueId,
        ],
        sql: `UPDATE ${TABLE_MEMORY_CUES}
              SET gist = ?,
                  summary = ?,
                  formation_kind = ?,
                  dimension = ?,
                  scope = ?,
                  domain_tags = ?,
                  impact_level = ?,
                  track = ?,
                  anchors = ?,
                  pointers = ?,
                  evidence_refs = ?,
                  focus_surface = ?,
                  activation_score = COALESCE(?, activation_score),
                  retention_score = COALESCE(?, retention_score),
                  manifestation_state = ?,
                  retention_state = ?,
                  decay_profile = ?,
                  confidence = ?,
                  metadata = ?,
                  updated_at = ?
              WHERE cue_id = ?`,
      });
      return {
        cueId,
        impactLevel: nextImpactLevel,
        inserted: false,
      };
    }

    await this.writer.write({
      params: [
        cueId,
        input.projectId,
        normalizedCue.gist,
        normalizedCue.summary,
        normalizedCue.source,
        normalizedCue.formationKind,
        normalizedCue.dimension,
        normalizedCue.scope,
        normalizedCue.domainTags.length > 0 ? stableStringify(normalizedCue.domainTags) : null,
        nextImpactLevel,
        normalizedCue.track,
        anchorsJson,
        stableStringify(normalizedCue.pointers),
        normalizedCue.evidenceRefs.length > 0
          ? stableStringify(normalizedCue.evidenceRefs)
          : null,
        normalizedCue.focusSurface,
        normalizedCue.activationScore ?? 0,
        normalizedCue.retentionScore ?? 0.5,
        normalizedCue.manifestationState ?? 'hidden',
        normalizedCue.retentionState ?? 'working',
        normalizedCue.decayProfile ?? 'normal',
        normalizedCue.confidence ?? input.confidence,
        now,
        now,
        normalizedCue.metadata,
      ],
      sql: `INSERT INTO ${TABLE_MEMORY_CUES} (
              cue_id,
              project_id,
              gist,
              summary,
              source,
              formation_kind,
              dimension,
              scope,
              domain_tags,
              impact_level,
              track,
              anchors,
              pointers,
              evidence_refs,
              focus_surface,
              activation_score,
              retention_score,
              manifestation_state,
              retention_state,
              decay_profile,
              confidence,
              created_at,
              updated_at,
              metadata
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)` ,
    });
    return {
      cueId,
      impactLevel: nextImpactLevel,
      inserted: true,
    };
  }

  getCue(cueId: string): CueRow | null {
    return this.stateStore.read(
      (db) =>
        (db
          .prepare(`SELECT * FROM ${TABLE_MEMORY_CUES} WHERE cue_id = ?`)
          .get(cueId) as CueRow | undefined) ?? null,
      null,
    );
  }

  private findExistingCue(
    projectId: string,
    source: string,
    anchorsJson: string,
  ): ExistingCueSummary | null {
    return this.stateStore.read(
      (db) =>
        (db
          .prepare(
            `SELECT cue_id, hit_count, impact_level
             FROM ${TABLE_MEMORY_CUES}
             WHERE project_id = ?
               AND source = ?
               AND anchors = ?
             LIMIT 1`,
          )
          .get(projectId, source, anchorsJson) as ExistingCueSummary | undefined) ?? null,
      null,
    );
  }

  private resolveImpactLevel(
    existingImpactLevel: string | undefined,
    requestedImpactLevel: CueImpactLevel,
    pointerCount: number,
    hitCount: number,
  ): CueImpactLevel {
    const existing = toImpactLevel(existingImpactLevel);
    let resolved =
      IMPACT_LEVEL_ORDER[existing] > IMPACT_LEVEL_ORDER[requestedImpactLevel]
        ? existing
        : requestedImpactLevel;

    if (resolved === 'working' && hitCount >= 3 && pointerCount > 0) {
      resolved = 'consolidated';
    }

    return resolved;
  }
}

function toImpactLevel(value: string | undefined): CueImpactLevel {
  if (value === 'canon' || value === 'consolidated' || value === 'working') {
    return value;
  }

  return 'working';
}
