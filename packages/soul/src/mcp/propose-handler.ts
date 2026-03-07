import { SoulToolsSchemas } from '@do-what/protocol';
import { SoulToolValidationError } from './types.js';
import { CheckpointQueue } from '../write/checkpoint-queue.js';
import {
  ProposalService,
  ProposalValidationError,
} from '../write/proposal-service.js';
import { createReviewExecutor, type ReviewHandlerOptions } from './review-handler.js';

const WORKING_AUTO_ACCEPT_INTERVAL_MS = 100;

class WorkingAutoAcceptQueue {
  private lastIssuedAt = 0;
  private queue = Promise.resolve();

  enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const scheduled = this.queue.then(async () => {
      const now = Date.now();
      const delay = Math.max(0, this.lastIssuedAt + WORKING_AUTO_ACCEPT_INTERVAL_MS - now);
      if (delay > 0) {
        await new Promise((resolve) => {
          setTimeout(resolve, delay);
        });
      }
      this.lastIssuedAt = Date.now();
      return operation();
    });
    this.queue = scheduled.then(() => undefined, () => undefined);
    return scheduled;
  }
}

export interface ProposeHandlerOptions extends ReviewHandlerOptions {
  checkpointQueue: CheckpointQueue;
  proposalService: ProposalService;
}

export function createProposeHandler(options: ProposeHandlerOptions) {
  const autoAcceptQueue = new WorkingAutoAcceptQueue();
  const executeReview = createReviewExecutor(options);

  return async function handlePropose(arguments_: unknown): Promise<unknown> {
    const parsed = SoulToolsSchemas['soul.propose_memory_update'].safeParse(arguments_);
    if (!parsed.success) {
      throw new SoulToolValidationError(
        'Invalid soul.propose_memory_update arguments',
        parsed.error.issues,
      );
    }

    try {
      const proposal = await options.proposalService.propose(parsed.data);
      if (!proposal.requiresCheckpoint) {
        const accepted = await autoAcceptQueue.enqueue(() =>
          executeReview({
            action: 'accept',
            proposalId: proposal.proposalId,
            resolver: 'auto',
          }),
        );
        return {
          ...accepted,
          proposal_id: proposal.proposalId,
          requires_checkpoint: false,
        };
      }

      await options.checkpointQueue.enqueue(proposal);
      return {
        proposal_id: proposal.proposalId,
        requires_checkpoint: proposal.requiresCheckpoint,
        status: proposal.status,
      };
    } catch (error) {
      if (error instanceof ProposalValidationError) {
        throw new SoulToolValidationError(error.message);
      }
      throw error;
    }
  };
}
