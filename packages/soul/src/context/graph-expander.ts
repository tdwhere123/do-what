import { estimateTokens } from '../search/budget-calculator.js';
import type { GraphRecallService } from '../graph/recall.js';
import type { ContextRequest, SlotEntry } from './types.js';

export class GraphExpander {
  private readonly graphRecall: GraphRecallService;

  constructor(graphRecall: GraphRecallService) {
    this.graphRecall = graphRecall;
  }

  async expand(slots: readonly SlotEntry[], request: ContextRequest): Promise<SlotEntry[]> {
    const seedCueIds = request.seed_cue_ids?.length
      ? [...request.seed_cue_ids]
      : slots.slice(0, 5).map((slot) => slot.cue_id);
    if (seedCueIds.length === 0) {
      return [];
    }

    const recall = await this.graphRecall.recall({
      max_neighbors_per_seed: 3,
      max_seeds: 5,
      project_id: request.project_id,
      rerank_top_k: 15,
      seed_cue_ids: seedCueIds,
    });
    const seedCueIdSet = new Set(seedCueIds);

    return recall.top_k
      .filter((cue) => !seedCueIdSet.has(cue.cueId))
      .slice(0, 60)
      .map((cue) => ({
        activation_score: cue.score,
        content: cue.gist,
        cue_id: cue.cueId,
        gist: cue.gist,
        origin: 'graph',
        slot_type: 'hint_slot',
        token_count: estimateTokens(cue.gist),
      }));
  }
}
