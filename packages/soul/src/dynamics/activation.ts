import { normalizeKarmaEvent, type KarmaEvent } from './karma.js';

export function updateActivation(
  current: number,
  karma: KarmaEvent,
  now: Date,
): number {
  const normalized = normalizeKarmaEvent(karma);
  const occurredAt = Date.parse(normalized.occurred_at);
  const elapsedDays = Number.isNaN(occurredAt)
    ? 0
    : Math.max(0, (now.getTime() - occurredAt) / (24 * 60 * 60 * 1000));
  const recencyDecay = Math.pow(0.9, elapsedDays);
  return clampActivation(current + normalized.weight * recencyDecay);
}

export function clampActivation(value: number): number {
  return Number(Math.max(0, Math.min(10, value)).toFixed(4));
}
