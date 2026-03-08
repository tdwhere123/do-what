import type { CueRef } from '@do-what/protocol';
import { ContextLens } from '../context/lens.js';
import type { SoulEventPublisher } from '../mcp/types.js';
import type { MemorySearchInput, MemorySearchResult } from './memory-search.js';
import { MemorySearchService } from './memory-search.js';

export class RetrievalRouter {
  private readonly contextLens?: ContextLens;
  private readonly publishEvent?: SoulEventPublisher;
  private readonly searchService: MemorySearchService;

  constructor(
    searchService: MemorySearchService,
    contextLens?: ContextLens,
    publishEvent?: SoulEventPublisher,
  ) {
    this.contextLens = contextLens;
    this.publishEvent = publishEvent;
    this.searchService = searchService;
  }

  async getInjectionHints(input: MemorySearchInput): Promise<CueRef[]> {
    if (this.contextLens) {
      const bundle = await this.contextLens.assemble({
        anchors: input.anchors,
        budget_tokens: Math.min(input.budget ?? 600, 600),
        dimension: input.dimension,
        focus_surface: 'default',
        project_id: input.project_id,
        query: input.query,
        tracks: input.tracks,
        trigger: 'hint',
      });

      const cues = bundle.slots.slice(0, Math.min(input.limit ?? 3, 3)).map((slot) => ({
        cueId: slot.cue_id,
        gist: slot.gist,
        pointers: [],
        score: slot.activation_score,
        why: slot.origin === 'graph' ? 'graph hint' : 'context slot',
      }));

      for (const cue of cues) {
        this.publishEvent?.({
          cueId: cue.cueId,
          event: 'context_cue_used',
          projectId: input.project_id,
          runId: 'soul',
          source: 'soul.retrieval',
          timestamp: new Date().toISOString(),
          trigger: 'hint',
        });
      }

      return cues;
    }

    const result = await this.searchService.search({
      ...input,
      budget: Math.min(input.budget ?? 600, 600),
      limit: Math.min(input.limit ?? 3, 3),
    });

    return result.cues.map((cue) => ({
      ...cue,
      pointers: [],
    }));
  }

  async search(input: MemorySearchInput): Promise<MemorySearchResult> {
    return this.searchService.search(input);
  }
}
