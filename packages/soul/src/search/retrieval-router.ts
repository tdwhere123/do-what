import type { CueRef } from '@do-what/protocol';
import type { MemorySearchInput, MemorySearchResult } from './memory-search.js';
import { MemorySearchService } from './memory-search.js';

export class RetrievalRouter {
  private readonly searchService: MemorySearchService;

  constructor(searchService: MemorySearchService) {
    this.searchService = searchService;
  }

  async getInjectionHints(input: MemorySearchInput): Promise<CueRef[]> {
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
