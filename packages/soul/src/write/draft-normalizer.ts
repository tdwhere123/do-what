import { stableStringify, uniqueStrings } from '../utils/json.js';

export type CueImpactLevel = 'working' | 'consolidated' | 'canon';

export interface NormalizedCueDraft {
  activationScore: number | null;
  anchors: string[];
  claimConfidence: number | null;
  claimDraft: string | null;
  claimGist: string | null;
  claimKey: string | null;
  claimMode: string | null;
  claimNamespace: string | null;
  claimScope: string | null;
  claimSource: string | null;
  claimStrength: number | null;
  claimValue: string | null;
  confidence: number | null;
  decayProfile: string | null;
  dimension: string | null;
  domainTags: string[];
  evidenceRefs: string[];
  focusSurface: string | null;
  formationKind: string | null;
  gist: string;
  impactLevel: CueImpactLevel;
  legacyType: string | null;
  manifestationState: string | null;
  metadata: string | null;
  pointers: string[];
  retentionScore: number | null;
  retentionState: string | null;
  scope: string;
  source: string;
  summary: string | null;
  track: string | null;
}

export interface NormalizedEdgeDraft {
  confidence: number;
  evidence: string | null;
  relation: string;
  sourceAnchor: string | null;
  sourceId: string | null;
  targetAnchor: string | null;
  targetId: string | null;
  track: string | null;
}

const KNOWN_CUE_KEYS = new Set([
  'activation_score',
  'anchors',
  'claim_confidence',
  'claim_draft',
  'claim_gist',
  'claim_key',
  'claim_mode',
  'claim_namespace',
  'claim_scope',
  'claim_source',
  'claim_strength',
  'claim_value',
  'confidence',
  'decay_profile',
  'dimension',
  'domain_tags',
  'evidence_refs',
  'focus_surface',
  'formation_kind',
  'gist',
  'impact_level',
  'manifestation_state',
  'metadata',
  'pointers',
  'retention_score',
  'retention_state',
  'scope',
  'snippet_excerpt',
  'source',
  'summary',
  'track',
  'type',
]);

function readNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function readOptionalString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function readOptionalJsonString(value: unknown): string | null {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return stableStringify(value);
  }

  return readOptionalString(value);
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return uniqueStrings(
    value
      .filter((item): item is string => typeof item === 'string')
      .map((item) => item.trim())
      .filter((item) => item.length > 0),
  ).sort((left, right) => left.localeCompare(right));
}

function readMetadata(record: Record<string, unknown>): string | null {
  const metadataEntries = Object.entries(record).filter(
    ([key]) => !KNOWN_CUE_KEYS.has(key),
  );
  if (metadataEntries.length === 0) {
    if (record.metadata && typeof record.metadata === 'object' && !Array.isArray(record.metadata)) {
      return stableStringify(record.metadata);
    }
    return readOptionalString(record.metadata) ?? null;
  }

  return stableStringify(Object.fromEntries(metadataEntries));
}

export function applyCueDraftEdits(
  draft: Record<string, unknown>,
  edits: Record<string, unknown>,
): Record<string, unknown> {
  return {
    ...draft,
    ...edits,
  };
}

export function normalizeCueDraft(
  draft: Record<string, unknown>,
  fallbackImpactLevel: CueImpactLevel,
): NormalizedCueDraft {
  const gist = readOptionalString(draft.gist);
  if (!gist) {
    throw new Error('cue_draft.gist is required');
  }

  const legacyType = readOptionalString(draft.type);
  const classification = resolveClassification(
    readOptionalString(draft.formation_kind),
    readOptionalString(draft.dimension),
    legacyType,
  );

  return {
    activationScore: readNumber(draft.activation_score),
    anchors: readStringArray(draft.anchors),
    claimConfidence: readNumber(draft.claim_confidence),
    claimDraft: readOptionalJsonString(draft.claim_draft),
    claimGist: readOptionalString(draft.claim_gist),
    claimKey: readOptionalString(draft.claim_key),
    claimMode: readOptionalString(draft.claim_mode),
    claimNamespace: readOptionalString(draft.claim_namespace),
    claimScope: readOptionalString(draft.claim_scope),
    claimSource: readOptionalString(draft.claim_source),
    claimStrength: readNumber(draft.claim_strength),
    claimValue: readOptionalString(draft.claim_value),
    confidence: readNumber(draft.confidence),
    decayProfile: readOptionalString(draft.decay_profile),
    dimension: classification.dimension,
    domainTags: readStringArray(draft.domain_tags),
    evidenceRefs: readStringArray(draft.evidence_refs),
    focusSurface: readOptionalString(draft.focus_surface) ?? 'default',
    formationKind: classification.formationKind,
    gist,
    impactLevel: toImpactLevel(draft.impact_level, fallbackImpactLevel),
    legacyType,
    manifestationState: readOptionalString(draft.manifestation_state),
    metadata: readMetadata(draft),
    pointers: readStringArray(draft.pointers),
    retentionScore: readNumber(draft.retention_score),
    retentionState: readOptionalString(draft.retention_state),
    scope: readOptionalString(draft.scope) ?? 'project',
    source: readOptionalString(draft.source) ?? 'soul.user',
    summary: readOptionalString(draft.summary),
    track: readOptionalString(draft.track),
  };
}

export function normalizeEdgeDrafts(
  edgeDrafts: readonly Record<string, unknown>[],
): NormalizedEdgeDraft[] {
  return edgeDrafts
    .map((draft) => {
      const relation = readOptionalString(draft.relation);
      if (!relation) {
        return null;
      }

      return {
        confidence: readNumber(draft.confidence) ?? 0.5,
        evidence: readOptionalString(draft.evidence),
        relation,
        sourceAnchor:
          readOptionalString(draft.source_anchor) ?? readOptionalString(draft.source),
        sourceId: readOptionalString(draft.source_id),
        targetAnchor:
          readOptionalString(draft.target_anchor) ?? readOptionalString(draft.target),
        targetId: readOptionalString(draft.target_id),
        track: readOptionalString(draft.track),
      };
    })
    .filter((draft): draft is NormalizedEdgeDraft => draft !== null);
}

function toImpactLevel(
  value: unknown,
  fallbackImpactLevel: CueImpactLevel,
): CueImpactLevel {
  if (value === 'working' || value === 'consolidated' || value === 'canon') {
    return value;
  }

  return fallbackImpactLevel;
}

function resolveClassification(
  formationKind: string | null,
  dimension: string | null,
  legacyType: string | null,
): {
  dimension: string | null;
  formationKind: string | null;
} {
  if (formationKind || dimension) {
    return {
      dimension,
      formationKind,
    };
  }

  switch (legacyType) {
    case 'fact':
      return { dimension: 'technical', formationKind: 'observation' };
    case 'pattern':
      return { dimension: 'technical', formationKind: 'inference' };
    case 'decision':
      return { dimension: 'behavioral', formationKind: 'interaction' };
    case 'risk':
      return { dimension: 'contextual', formationKind: 'synthesis' };
    default:
      return { dimension: 'technical', formationKind: 'observation' };
  }
}
