import type { SystemHealthEvent } from '@do-what/protocol';
import type { SoulEventPublisher } from '../mcp/types.js';
import { ProposalService, type ProposalRecord } from './proposal-service.js';

export interface CheckpointQueueOptions {
  proposalService: ProposalService;
  publishEvent?: SoulEventPublisher;
}

export class CheckpointQueue {
  private readonly proposalService: ProposalService;
  private readonly publishEvent?: SoulEventPublisher;

  constructor(options: CheckpointQueueOptions) {
    this.proposalService = options.proposalService;
    this.publishEvent = options.publishEvent;
  }

  async enqueue(proposal: ProposalRecord): Promise<void> {
    this.publishCheckpointEvent(proposal.projectId);
  }

  getPending(projectId?: string): ProposalRecord[] {
    return this.proposalService.getPending(projectId).filter(
      (proposal) => proposal.requiresCheckpoint,
    );
  }

  size(projectId?: string): number {
    return this.getPending(projectId).length;
  }

  private publishCheckpointEvent(projectId: string): void {
    if (!this.publishEvent) {
      return;
    }

    const event: Omit<SystemHealthEvent, 'revision'> = {
      event: 'checkpoint_queue',
      pendingCount: this.size(projectId),
      projectId,
      runId: 'soul',
      source: 'soul.module',
      timestamp: new Date().toISOString(),
    };
    this.publishEvent(event);
  }
}
