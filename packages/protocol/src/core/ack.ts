export type AckEntityType =
  | 'run'
  | 'engine'
  | 'approval'
  | 'checkpoint'
  | 'event';

export type AckStatus = 'pending' | 'committed' | 'failed';

export interface AckOverlay {
  readonly ack_id: string;
  readonly entity_type: AckEntityType;
  readonly entity_id: string;
  readonly revision: number;
  readonly status: AckStatus;
  readonly created_at: string;
  readonly committed_at?: string;
  readonly error?: string;
}

