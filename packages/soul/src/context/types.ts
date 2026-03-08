export type ContextTrigger = 'hint' | 'excerpt' | 'full';
export type SlotType = 'hint_slot' | 'excerpt_slot' | 'full_slot';

export interface ContextRequest {
  anchors?: readonly string[];
  budget_tokens?: number;
  dimension?: string;
  focus_surface?: string;
  project_id: string;
  query?: string;
  seed_cue_ids?: readonly string[];
  tracks?: readonly string[];
  trigger: ContextTrigger;
}

export interface SlotEntry {
  activation_score: number;
  content: string;
  cue_id: string;
  gist: string;
  origin: 'graph' | 'seed';
  slot_type: SlotType;
  token_count: number;
}

export interface ContextBundle {
  assembly_ms: number;
  slots: SlotEntry[];
  total_tokens: number;
  truncated: boolean;
}
