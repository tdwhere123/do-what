import type { CueRow } from '../db/schema.js';

const HALF_LIFE_DAYS: Record<string, number> = {
  inference: 14,
  interaction: 60,
  observation: 7,
  synthesis: 30,
};

export function computeRetention(
  cue: Pick<
    CueRow,
    | 'created_at'
    | 'formation_kind'
    | 'impact_level'
    | 'last_hit_at'
    | 'last_used_at'
    | 'retention_score'
    | 'updated_at'
  >,
  now: Date,
): number {
  const baseScore = cue.retention_score > 0 ? cue.retention_score : 1;
  const referenceTime =
    cue.last_used_at
    ?? cue.last_hit_at
    ?? cue.updated_at
    ?? cue.created_at;
  const referenceMs = Date.parse(referenceTime);
  if (Number.isNaN(referenceMs)) {
    return baseScore;
  }

  const elapsedDays = Math.max(0, (now.getTime() - referenceMs) / (24 * 60 * 60 * 1000));
  const protectedDays =
    cue.impact_level === 'working'
      ? elapsedDays
      : elapsedDays * 0.5;
  const halfLife = HALF_LIFE_DAYS[cue.formation_kind ?? 'observation'] ?? HALF_LIFE_DAYS.observation;
  return Number((baseScore * Math.pow(2, -protectedDays / halfLife)).toFixed(4));
}

export function shouldPrune(
  cue: Pick<
    CueRow,
    | 'created_at'
    | 'formation_kind'
    | 'impact_level'
    | 'last_hit_at'
    | 'last_used_at'
    | 'retention_score'
    | 'updated_at'
  >,
  now: Date,
  threshold = 0.05,
): boolean {
  return cue.impact_level === 'working' && computeRetention(cue, now) < threshold;
}
