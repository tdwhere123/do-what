import { SoulToolsSchemas } from '@do-what/protocol';
import { createMemoryEvent, publishMemoryEvent } from './events.js';
import type { SoulEventPublisher } from './types.js';
import { SoulToolValidationError } from './types.js';
import { CueWriter } from '../write/cue-writer.js';
import { EdgeWriter } from '../write/edge-writer.js';
import { RepoCommitter } from '../write/repo-committer.js';
import {
  applyReviewEdits,
  ProposalService,
  ProposalValidationError,
  type ProposalRecord,
} from '../write/proposal-service.js';

export interface ReviewExecutorRequest {
  action: 'accept' | 'edit' | 'hint_only' | 'reject';
  edits?: Record<string, unknown>;
  proposalId: string;
  resolver: 'auto' | 'user';
}

export interface ReviewHandlerOptions {
  cueWriter: CueWriter;
  edgeWriter: EdgeWriter;
  proposalService: ProposalService;
  publishEvent?: SoulEventPublisher;
  repoCommitter: RepoCommitter;
}

export function createReviewExecutor(options: ReviewHandlerOptions) {
  return async function executeReview(
    request: ReviewExecutorRequest,
  ): Promise<Record<string, unknown>> {
    const proposal = options.proposalService.getProposal(request.proposalId);
    if (!proposal) {
      throw new ProposalValidationError(`proposal not found: ${request.proposalId}`);
    }
    if (proposal.status !== 'pending') {
      throw new ProposalValidationError(
        `proposal ${request.proposalId} is already ${proposal.status}`,
      );
    }

    if (request.action === 'reject') {
      await options.proposalService.finalize({
        proposalId: request.proposalId,
        resolver: request.resolver,
        status: 'rejected',
      });
      return {
        committed: false,
        proposal_id: request.proposalId,
        status: 'rejected',
      };
    }

    const prepared = prepareProposal(proposal, request);
    const cueWrite = await options.cueWriter.upsert({
      confidence: prepared.confidence,
      cueDraft: prepared.cueDraft,
      impactLevel: prepared.impactLevel,
      projectId: proposal.projectId,
    });
    const edgeCount = await options.edgeWriter.insertOrIgnore({
      cueDraft: prepared.cueDraft,
      cueId: cueWrite.cueId,
      edgeDrafts: prepared.edgeDrafts,
      projectId: proposal.projectId,
    });
    const repoCommit = request.action === 'hint_only'
      ? { committed: false }
      : await options.repoCommitter.commitCue({
          cueDraft: prepared.cueDraft,
          cueId: cueWrite.cueId,
          impactLevel: cueWrite.impactLevel,
          projectId: proposal.projectId,
        });
    const status = request.action === 'hint_only' ? 'hint_only' : 'accepted';
    await options.proposalService.finalize({
      confidence: prepared.confidence,
      cueDraft: prepared.cueDraft,
      edgeDrafts: prepared.edgeDrafts,
      impactLevel: request.action === 'hint_only' ? prepared.impactLevel : cueWrite.impactLevel,
      proposalId: request.proposalId,
      resolver: request.resolver,
      status,
    });

    publishMemoryEvent(
      options.publishEvent,
      createMemoryEvent({
        commitSha: repoCommit.commitSha,
        cueId: cueWrite.cueId,
        operation: 'commit',
        proposalId: request.proposalId,
      }),
    );

    return {
      committed: repoCommit.committed,
      commit_sha: repoCommit.commitSha,
      cue_id: cueWrite.cueId,
      edge_count: edgeCount,
      impact_level: cueWrite.impactLevel,
      proposal_id: request.proposalId,
      status,
    };
  };
}

export function createReviewHandler(options: ReviewHandlerOptions) {
  const executeReview = createReviewExecutor(options);

  return async function handleReview(arguments_: unknown): Promise<unknown> {
    const parsed = SoulToolsSchemas['soul.review_memory_proposal'].safeParse(arguments_);
    if (!parsed.success) {
      throw new SoulToolValidationError(
        'Invalid soul.review_memory_proposal arguments',
        parsed.error.issues,
      );
    }

    try {
      return await executeReview({
        action: parsed.data.action,
        edits: parsed.data.edits,
        proposalId: parsed.data.proposal_id,
        resolver: 'user',
      });
    } catch (error) {
      if (error instanceof ProposalValidationError) {
        throw new SoulToolValidationError(error.message);
      }
      throw error;
    }
  };
}

function prepareProposal(
  proposal: ProposalRecord,
  request: ReviewExecutorRequest,
): {
  confidence: number;
  cueDraft: Record<string, unknown>;
  edgeDrafts: Array<Record<string, unknown>>;
  impactLevel: 'working' | 'consolidated' | 'canon';
} {
  const edited = request.action === 'edit'
    ? applyReviewEdits(proposal, request.edits)
    : {
        confidence: proposal.confidence,
        cueDraft: proposal.cueDraft,
        edgeDrafts: proposal.edgeDrafts,
        impactLevel: proposal.impactLevel,
      };

  if (request.action === 'hint_only') {
    return {
      ...edited,
      impactLevel: 'working',
    };
  }

  return edited;
}
