import type { SoulStateStore } from '../db/soul-state-store.js';
import { GraphRecallService } from '../graph/recall.js';
import { trimSlots } from './budget-trimmer.js';
import { GraphExpander } from './graph-expander.js';
import { SlotFiller } from './slot-filler.js';
import type { ContextBundle, ContextRequest } from './types.js';

export class ContextLens {
  private readonly graphExpander: GraphExpander;
  private readonly slotFiller: SlotFiller;

  constructor(stateStore: SoulStateStore) {
    this.slotFiller = new SlotFiller(stateStore);
    this.graphExpander = new GraphExpander(new GraphRecallService(stateStore));
  }

  async assemble(request: ContextRequest): Promise<ContextBundle> {
    const startedAt = Date.now();
    const filled = this.slotFiller.fill(request);
    const expanded = await this.graphExpander.expand(filled, request);
    const trimmed = trimSlots(
      dedupeSlots([...filled, ...expanded]),
      Math.min(request.budget_tokens ?? 600, 600),
    );

    return {
      assembly_ms: Date.now() - startedAt,
      slots: trimmed.slots,
      total_tokens: trimmed.total_tokens,
      truncated: trimmed.truncated,
    };
  }
}

function dedupeSlots(slots: readonly ContextBundle['slots'][number][]) {
  const seen = new Set<string>();
  return slots.filter((slot) => {
    if (seen.has(slot.cue_id)) {
      return false;
    }
    seen.add(slot.cue_id);
    return true;
  });
}
