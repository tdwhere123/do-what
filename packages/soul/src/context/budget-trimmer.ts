import { estimateTokens } from '../search/budget-calculator.js';
import type { SlotEntry } from './types.js';

interface TrimResult {
  slots: SlotEntry[];
  total_tokens: number;
  truncated: boolean;
}

function priority(slot: SlotEntry): number {
  switch (slot.slot_type) {
    case 'full_slot':
      return 3;
    case 'excerpt_slot':
      return 2;
    default:
      return 1;
  }
}

function shrinkSlot(slot: SlotEntry, maxTokens: number): SlotEntry | null {
  if (maxTokens <= 0) {
    return null;
  }

  if (slot.token_count <= maxTokens) {
    return slot;
  }

  const nextContent = slot.content.slice(0, Math.max(1, maxTokens * 4));
  return {
    ...slot,
    content: nextContent,
    token_count: estimateTokens(nextContent),
  };
}

export function trimSlots(
  slots: readonly SlotEntry[],
  budgetTokens: number,
): TrimResult {
  const limitedBudget = Math.max(0, Math.min(budgetTokens, 600));
  const byActivation = [...slots].sort(
    (left, right) => right.activation_score - left.activation_score,
  );
  const forcedKeys = new Set(
    byActivation.slice(0, 3).map((slot) => `${slot.cue_id}:${slot.origin}:${slot.slot_type}`),
  );
  const ordered = [...slots].sort((left, right) => {
    const priorityDelta = priority(right) - priority(left);
    if (priorityDelta !== 0) {
      return priorityDelta;
    }
    return right.activation_score - left.activation_score;
  });
  const selected: SlotEntry[] = [];
  let totalTokens = 0;
  let truncated = false;

  for (const slot of ordered) {
    const key = `${slot.cue_id}:${slot.origin}:${slot.slot_type}`;
    const remaining = limitedBudget - totalTokens;
    if (remaining <= 0) {
      truncated = true;
      break;
    }

    const nextSlot = forcedKeys.has(key) ? shrinkSlot(slot, remaining) : slot;
    if (!nextSlot || nextSlot.token_count > remaining) {
      truncated = true;
      continue;
    }

    selected.push(nextSlot);
    totalTokens += nextSlot.token_count;
  }

  return {
    slots: selected,
    total_tokens: totalTokens,
    truncated,
  };
}
