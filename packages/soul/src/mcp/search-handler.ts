import { SoulToolsSchemas } from '@do-what/protocol';
import type { RetrievalRouter } from '../search/retrieval-router.js';
import { createMemoryEvent, publishMemoryEvent } from './events.js';
import type { SoulEventPublisher } from './types.js';
import { SoulToolValidationError } from './types.js';

export interface SearchHandlerOptions {
  publishEvent?: SoulEventPublisher;
  retrievalRouter: RetrievalRouter;
}

export function createSearchHandler(options: SearchHandlerOptions) {
  return async function handleSearch(arguments_: unknown): Promise<unknown> {
    const parsed = SoulToolsSchemas['soul.memory_search'].safeParse(arguments_);
    if (!parsed.success) {
      throw new SoulToolValidationError(
        'Invalid soul.memory_search arguments',
        parsed.error.issues,
      );
    }

    const result = await options.retrievalRouter.search(parsed.data);
    publishMemoryEvent(
      options.publishEvent,
      createMemoryEvent({
        budgetUsed: result.budget_used,
        operation: 'search',
        query: parsed.data.query,
        results: result.cues,
      }),
    );

    return result;
  };
}
