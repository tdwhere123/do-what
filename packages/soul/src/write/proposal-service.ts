import { randomUUID } from 'node:crypto';
import type {
  SoulProposeMemoryUpdateInput,
  SoulReviewMemoryProposalInput,
} from '@do-what/protocol';
import { TABLE_MEMORY_PROPOSALS, type ProposalRow } from '../db/schema.js';
import type { SoulStateStore } from '../db/soul-state-store.js';
import type { SoulWorkerClient } from '../db/worker-client.js';
import { createMemoryEvent, publishMemoryEvent } from '../mcp/events.js';
import type { SoulEventPublisher } from '../mcp/types.js';
import { parseRecordArray, parseUnknownRecord, stableStringify } from '../utils/json.js';
import {
  normalizeCueDraft,
  normalizeEdgeDrafts,
  type CueImpactLevel,
} from './draft-normalizer.js';

export type ProposalStatus = 'accepted' | 'hint_only' | 'pending' | 'rejected';

export interface ProposalRecord {
  confidence: number;
  cueDraft: Record<string, unknown>;
  edgeDrafts: Array<Record<string, unknown>>;
  impactLevel: CueImpactLevel;
  projectId: string;
  proposalId: string;
  proposedAt: string;
  status: ProposalStatus;
  requiresCheckpoint: boolean;
  resolvedAt: string | null;
  resolver: string | null;
}

export interface ProposalFinalizeInput {
  confidence?: number;
  cueDraft?: Record<string, unknown>;
  edgeDrafts?: Array<Record<string, unknown>>;
  impactLevel?: CueImpactLevel;
  proposalId: string;
  resolver: 'auto' | 'user';
  status: ProposalStatus;
}

export interface ProposalServiceOptions {
  publishEvent?: SoulEventPublisher;
  stateStore: SoulStateStore;
  writer: SoulWorkerClient;
}

export class ProposalValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProposalValidationError';
  }
}

export class ProposalService {
  private readonly publishEvent?: SoulEventPublisher;
  private readonly stateStore: SoulStateStore;
  private readonly writer: SoulWorkerClient;

  constructor(options: ProposalServiceOptions) {
    this.publishEvent = options.publishEvent;
    this.stateStore = options.stateStore;
    this.writer = options.writer;
  }

  async finalize(input: ProposalFinalizeInput): Promise<ProposalRecord> {
    const existing = this.getProposal(input.proposalId);
    if (!existing) {
      throw new ProposalValidationError(`proposal not found: ${input.proposalId}`);
    }

    const nextCueDraft = input.cueDraft ?? existing.cueDraft;
    const nextEdgeDrafts = input.edgeDrafts ?? existing.edgeDrafts;
    const nextImpactLevel = input.impactLevel ?? existing.impactLevel;
    validateDrafts(nextCueDraft, nextEdgeDrafts, nextImpactLevel);

    const resolvedAt = new Date().toISOString();
    await this.writer.write({
      params: [
        stableStringify(nextCueDraft),
        nextEdgeDrafts.length > 0 ? stableStringify(nextEdgeDrafts) : null,
        input.confidence ?? existing.confidence,
        nextImpactLevel,
        input.status,
        resolvedAt,
        input.resolver,
        input.proposalId,
      ],
      sql: `UPDATE ${TABLE_MEMORY_PROPOSALS}
            SET cue_draft = ?,
                edge_drafts = ?,
                confidence = ?,
                impact_level = ?,
                status = ?,
                resolved_at = ?,
                resolver = ?
            WHERE proposal_id = ?`,
    });

    const proposal = this.getProposal(input.proposalId);
    if (!proposal) {
      throw new Error(`proposal disappeared after finalize: ${input.proposalId}`);
    }
    return proposal;
  }

  getPending(projectId?: string): ProposalRecord[] {
    const params: unknown[] = ['pending'];
    const conditions = ['status = ?'];
    if (projectId) {
      conditions.push('project_id = ?');
      params.push(projectId);
    }

    return this.stateStore.read(
      (db) =>
        (
          db
            .prepare(
              `SELECT *
               FROM ${TABLE_MEMORY_PROPOSALS}
               WHERE ${conditions.join(' AND ')}
               ORDER BY proposed_at ASC`,
            )
            .all(...params) as ProposalRow[]
        ).map(mapProposalRow),
      [] as ProposalRecord[],
    );
  }

  getPendingCount(projectId?: string): number {
    const params: unknown[] = ['pending'];
    const conditions = ['status = ?'];
    if (projectId) {
      conditions.push('project_id = ?');
      params.push(projectId);
    }

    return this.stateStore.read(
      (db) =>
        (
          db
            .prepare(
              `SELECT COUNT(*) AS count
               FROM ${TABLE_MEMORY_PROPOSALS}
               WHERE ${conditions.join(' AND ')}`,
            )
            .get(...params) as { count?: number }
        ).count ?? 0,
      0,
    );
  }

  getProposal(proposalId: string): ProposalRecord | null {
    return this.stateStore.read(
      (db) => {
        const row = db
          .prepare(`SELECT * FROM ${TABLE_MEMORY_PROPOSALS} WHERE proposal_id = ?`)
          .get(proposalId) as ProposalRow | undefined;
        return row ? mapProposalRow(row) : null;
      },
      null,
    );
  }

  async propose(input: SoulProposeMemoryUpdateInput): Promise<ProposalRecord> {
    validateDrafts(
      input.cue_draft,
      input.edge_drafts ?? [],
      input.impact_level,
    );

    const proposalId = randomUUID();
    const proposedAt = new Date().toISOString();
    const requiresCheckpoint = proposalRequiresCheckpoint(input);
    await this.writer.write({
      params: [
        proposalId,
        input.project_id,
        stableStringify(input.cue_draft),
        input.edge_drafts && input.edge_drafts.length > 0
          ? stableStringify(input.edge_drafts)
          : null,
        input.confidence,
        input.impact_level,
        requiresCheckpoint ? 1 : 0,
        'pending',
        proposedAt,
      ],
      sql: `INSERT INTO ${TABLE_MEMORY_PROPOSALS} (
              proposal_id,
              project_id,
              cue_draft,
              edge_drafts,
              confidence,
              impact_level,
              requires_checkpoint,
              status,
              proposed_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    });

    publishMemoryEvent(
      this.publishEvent,
      createMemoryEvent({
        cueDraft: input.cue_draft,
        operation: 'propose',
        proposalId,
        requiresCheckpoint,
      }),
    );

    const proposal = this.getProposal(proposalId);
    if (!proposal) {
      throw new Error(`proposal disappeared after insert: ${proposalId}`);
    }
    return proposal;
  }
}

export function applyReviewEdits(
  proposal: ProposalRecord,
  edits: SoulReviewMemoryProposalInput['edits'],
): {
  confidence: number;
  cueDraft: Record<string, unknown>;
  edgeDrafts: Array<Record<string, unknown>>;
  impactLevel: CueImpactLevel;
} {
  if (!edits) {
    return {
      confidence: proposal.confidence,
      cueDraft: proposal.cueDraft,
      edgeDrafts: proposal.edgeDrafts,
      impactLevel: proposal.impactLevel,
    };
  }

  const cueEdits = { ...edits };
  const edgeDrafts = Array.isArray(cueEdits.edge_drafts)
    ? cueEdits.edge_drafts.filter(
        (value): value is Record<string, unknown> =>
          value !== null && typeof value === 'object' && !Array.isArray(value),
      )
    : proposal.edgeDrafts;
  delete cueEdits.edge_drafts;

  return {
    confidence:
      typeof cueEdits.confidence === 'number' ? cueEdits.confidence : proposal.confidence,
    cueDraft: {
      ...proposal.cueDraft,
      ...cueEdits,
    },
    edgeDrafts,
    impactLevel:
      cueEdits.impact_level === 'working'
      || cueEdits.impact_level === 'consolidated'
      || cueEdits.impact_level === 'canon'
        ? cueEdits.impact_level
        : proposal.impactLevel,
  };
}

function mapProposalRow(row: ProposalRow): ProposalRecord {
  return {
    confidence: row.confidence,
    cueDraft: parseUnknownRecord(row.cue_draft),
    edgeDrafts: parseRecordArray(row.edge_drafts),
    impactLevel: toImpactLevel(row.impact_level),
    projectId: row.project_id,
    proposalId: row.proposal_id,
    proposedAt: row.proposed_at,
    status: toProposalStatus(row.status),
    requiresCheckpoint: row.requires_checkpoint === 1,
    resolvedAt: row.resolved_at,
    resolver: row.resolver,
  };
}

function proposalRequiresCheckpoint(input: SoulProposeMemoryUpdateInput): boolean {
  const normalizedCue = normalizeCueDraft(input.cue_draft, input.impact_level);
  if (input.impact_level === 'canon') {
    return true;
  }

  return input.impact_level === 'consolidated' && normalizedCue.pointers.length > 0;
}

function toImpactLevel(value: string): CueImpactLevel {
  if (value === 'working' || value === 'consolidated' || value === 'canon') {
    return value;
  }
  return 'working';
}

function toProposalStatus(value: string): ProposalStatus {
  if (
    value === 'accepted'
    || value === 'hint_only'
    || value === 'pending'
    || value === 'rejected'
  ) {
    return value;
  }
  return 'pending';
}

function validateDrafts(
  cueDraft: Record<string, unknown>,
  edgeDrafts: readonly Record<string, unknown>[],
  impactLevel: CueImpactLevel,
): void {
  const normalizedCue = normalizeCueDraft(cueDraft, impactLevel);
  normalizeEdgeDrafts(edgeDrafts);
  if (impactLevel === 'canon' && normalizedCue.pointers.length === 0) {
    throw new ProposalValidationError('canon cue_draft must include at least one pointer');
  }
}
