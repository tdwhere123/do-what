export type ProjectionKind =
  | 'pending_soul_proposals'
  | 'healing_stats_view'
  | 'run_history_agg';

export interface ProjectionEntry<T> {
  readonly kind: ProjectionKind;
  readonly scope_id: string;
  readonly data: T;
  readonly computed_at: string;
  readonly staleness_ms: number;
}

