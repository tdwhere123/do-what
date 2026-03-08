export interface KarmaEvent {
  cue_id: string;
  karma_type: 'accept' | 'reject' | 'reuse' | 'supersede';
  occurred_at?: string;
  triggered_by: 'compiler' | 'engine' | 'user';
  weight?: number;
}

export const KARMA_WEIGHTS: Record<KarmaEvent['karma_type'], number> = {
  accept: 2,
  reject: -2,
  reuse: 1,
  supersede: -1,
};

export function normalizeKarmaEvent(event: KarmaEvent): Required<KarmaEvent> {
  return {
    ...event,
    occurred_at: event.occurred_at ?? new Date().toISOString(),
    weight: event.weight ?? KARMA_WEIGHTS[event.karma_type],
  };
}
