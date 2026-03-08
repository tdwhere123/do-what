export const TABLE_MEMORY_CUES = 'memory_cues';
export const TABLE_MEMORY_CUES_FTS = 'memory_cues_fts';
export const TABLE_MEMORY_GRAPH_EDGES = 'memory_graph_edges';
export const TABLE_EVIDENCE_INDEX = 'evidence_index';
export const TABLE_MEMORY_PROPOSALS = 'memory_proposals';
export const TABLE_PROJECTS = 'projects';
export const TABLE_REFACTOR_EVENTS = 'refactor_events';
export const TABLE_SOUL_SCHEMA_VERSION = 'soul_schema_version';
export const TABLE_SOUL_BUDGETS = 'soul_budgets';

export interface CueRow {
  cue_id: string;
  project_id: string | null;
  gist: string;
  summary: string | null;
  source: string;
  type: string | null;
  formation_kind: string | null;
  dimension: string | null;
  scope: string;
  domain_tags: string | null;
  impact_level: string;
  track: string | null;
  anchors: string;
  pointers: string;
  evidence_refs: string | null;
  focus_surface: string | null;
  snippet_excerpt: string | null;
  activation_score: number;
  retention_score: number;
  manifestation_state: string;
  retention_state: string;
  decay_profile: string;
  confidence: number;
  created_at: string;
  updated_at: string;
  last_used_at: string | null;
  last_hit_at: string | null;
  hit_count: number;
  reinforcement_count: number;
  contradiction_count: number;
  superseded_by: string | null;
  claim_draft: string | null;
  claim_confidence: number | null;
  claim_gist: string | null;
  claim_namespace: string | null;
  claim_key: string | null;
  claim_value: string | null;
  claim_scope: string | null;
  claim_mode: string | null;
  claim_source: string | null;
  claim_strength: number | null;
  pruned: number;
  metadata: string | null;
}

export interface EdgeRow {
  edge_id: string;
  source_id: string;
  target_id: string;
  relation: string;
  track: string | null;
  confidence: number;
  evidence: string | null;
  created_at: string;
}

export interface EvidenceRow {
  evidence_id: string;
  cue_id: string;
  pointer: string;
  pointer_key: string;
  level: string;
  content_hash: string | null;
  embedding: Uint8Array | null;
  last_accessed: string | null;
  access_count: number;
  relocated_pointer: string | null;
  relocation_attempted_at: string | null;
  relocation_status: string | null;
}

export interface SoulSchemaVersionRow {
  version: number;
  applied_at: string;
  description: string;
}

export interface ProjectRow {
  project_id: string;
  primary_key: string | null;
  secondary_key: string;
  workspace_path: string;
  fingerprint: string;
  memory_repo_path: string;
  created_at: string;
  last_active_at: string;
  bootstrapping_phase_days: number;
}

export interface ProposalRow {
  proposal_id: string;
  project_id: string;
  cue_draft: string;
  edge_drafts: string | null;
  confidence: number;
  impact_level: string;
  requires_checkpoint: number;
  status: string;
  proposed_at: string;
  resolved_at: string | null;
  resolver: string | null;
}

export interface SoulBudgetRow {
  created_at: string;
  date: string;
  dollars_used: number;
  tokens_used: number;
  updated_at: string;
}

export interface RefactorEventRow {
  commit_sha: string;
  detected_at: string;
  event_id: string;
  project_id: string;
  renames: string;
}
