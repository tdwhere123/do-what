import { randomUUID } from 'node:crypto';
import {
  ClaimDraftSchema,
  ClaimResolutionSchema,
  type ClaimDraft,
  type ClaimResolution,
} from '@do-what/protocol';
import { selectWinningClaim } from './slot-winner.js';

const DEFAULT_EXPIRY_MS = 30 * 60 * 1000;
const MAX_PENDING_PER_CUE = 100;

export interface PendingClaimRecord {
  claim: ClaimDraft;
  cueId: string;
  impactLevel: 'working' | 'consolidated' | 'canon';
  projectId: string;
  proposalId?: string;
}

export interface ClaimQueueCheckpointResult {
  accepted: PendingClaimRecord[];
  resolved: Array<{ record: PendingClaimRecord; resolution: ClaimResolution }>;
  resolutions: ClaimResolution[];
}

export interface ClaimQueueEnqueueInput {
  cueDraft: Record<string, unknown>;
  cueId: string;
  impactLevel: 'working' | 'consolidated' | 'canon';
  projectId: string;
  proposalId?: string;
}

function normalizeClaimDraft(
  input: ClaimQueueEnqueueInput,
): ClaimDraft | null {
  const claimDraftValue = input.cueDraft.claim_draft;
  const now = new Date();
  const baseRecord =
    claimDraftValue && typeof claimDraftValue === 'object' && !Array.isArray(claimDraftValue)
      ? { ...(claimDraftValue as Record<string, unknown>) }
      : {};
  const claimGist =
    typeof baseRecord.claim_gist === 'string' && baseRecord.claim_gist.trim().length > 0
      ? baseRecord.claim_gist.trim()
      : typeof input.cueDraft.claim_gist === 'string' && input.cueDraft.claim_gist.trim().length > 0
        ? input.cueDraft.claim_gist.trim()
        : null;

  if (!claimGist) {
    return null;
  }

  const draft = ClaimDraftSchema.parse({
    claim_confidence:
      typeof baseRecord.claim_confidence === 'number'
        ? baseRecord.claim_confidence
        : typeof input.cueDraft.claim_confidence === 'number'
          ? input.cueDraft.claim_confidence
          : 0.5,
    claim_gist: claimGist,
    claim_mode:
      baseRecord.claim_mode === 'assert'
      || baseRecord.claim_mode === 'retract'
      || baseRecord.claim_mode === 'supersede'
        ? baseRecord.claim_mode
        : input.cueDraft.claim_mode === 'assert'
          || input.cueDraft.claim_mode === 'retract'
          || input.cueDraft.claim_mode === 'supersede'
            ? input.cueDraft.claim_mode
            : 'assert',
    claim_source:
      baseRecord.claim_source === 'engine'
      || baseRecord.claim_source === 'compiler'
      || baseRecord.claim_source === 'user'
        ? baseRecord.claim_source
        : input.cueDraft.claim_source === 'engine'
          || input.cueDraft.claim_source === 'compiler'
          || input.cueDraft.claim_source === 'user'
            ? input.cueDraft.claim_source
            : 'engine',
    cue_id: input.cueId,
    draft_id:
      typeof baseRecord.draft_id === 'string' && baseRecord.draft_id.trim().length > 0
        ? baseRecord.draft_id
        : randomUUID(),
    expires_at:
      typeof baseRecord.expires_at === 'string'
        ? baseRecord.expires_at
        : new Date(now.getTime() + DEFAULT_EXPIRY_MS).toISOString(),
    proposed_at:
      typeof baseRecord.proposed_at === 'string'
        ? baseRecord.proposed_at
        : now.toISOString(),
  });

  return draft;
}

function toResolution(
  draftId: string,
  resolution: ClaimResolution['resolution'],
  resolver: ClaimResolution['resolver'],
  now: string,
): ClaimResolution {
  return ClaimResolutionSchema.parse({
    draft_id: draftId,
    resolution,
    resolved_at: now,
    resolver,
  });
}

export class ClaimQueue {
  private readonly pendingByCue = new Map<string, PendingClaimRecord[]>();

  enqueue(input: ClaimQueueEnqueueInput): ClaimDraft | null {
    const claim = normalizeClaimDraft(input);
    if (!claim) {
      return null;
    }

    const pending = this.pendingByCue.get(input.cueId) ?? [];
    const next = [...pending, {
      claim,
      cueId: input.cueId,
      impactLevel: input.impactLevel,
      projectId: input.projectId,
      proposalId: input.proposalId,
    }];
    this.pendingByCue.set(input.cueId, trimQueue(next));
    return claim;
  }

  resolveAtCheckpoint(projectId?: string, now = new Date()): ClaimQueueCheckpointResult {
    const accepted: PendingClaimRecord[] = [];
    const resolved: Array<{ record: PendingClaimRecord; resolution: ClaimResolution }> = [];
    const resolutions: ClaimResolution[] = [];
    const nowIso = now.toISOString();

    for (const [cueId, records] of this.pendingByCue.entries()) {
      const scoped = projectId
        ? records.filter((record) => record.projectId === projectId)
        : records;
      const untouched = projectId
        ? records.filter((record) => record.projectId !== projectId)
        : [];
      if (scoped.length === 0) {
        continue;
      }

      const expired = scoped.filter((record) => isExpired(record.claim, now));
      const active = scoped.filter((record) => !isExpired(record.claim, now));
      for (const record of expired) {
        const resolution = toResolution(record.claim.draft_id, 'expired', 'timeout', nowIso);
        resolutions.push(resolution);
        resolved.push({ record, resolution });
      }

      const winner = selectWinningClaim(active.map((record) => record.claim));
      if (winner) {
        const winningRecord = active.find((record) => record.claim.draft_id === winner.draft_id);
        if (winningRecord) {
          accepted.push(winningRecord);
          const resolution = toResolution(winner.draft_id, 'accepted', 'slot_winner', nowIso);
          resolutions.push(resolution);
          resolved.push({ record: winningRecord, resolution });
        }

        for (const record of active) {
          if (record.claim.draft_id !== winner.draft_id) {
            const resolution = toResolution(
              record.claim.draft_id,
              'superseded',
              'slot_winner',
              nowIso,
            );
            resolutions.push(resolution);
            resolved.push({ record, resolution });
          }
        }
      }

      if (untouched.length > 0) {
        this.pendingByCue.set(cueId, untouched);
      } else {
        this.pendingByCue.delete(cueId);
      }
    }

    return {
      accepted,
      resolved,
      resolutions,
    };
  }

  size(): number {
    let total = 0;
    for (const records of this.pendingByCue.values()) {
      total += records.length;
    }
    return total;
  }
}

function isExpired(claim: ClaimDraft, now: Date): boolean {
  if (!claim.expires_at) {
    return false;
  }

  return Date.parse(claim.expires_at) <= now.getTime();
}

function trimQueue(records: readonly PendingClaimRecord[]): PendingClaimRecord[] {
  if (records.length <= MAX_PENDING_PER_CUE) {
    return [...records];
  }

  const preserved = [...records].filter((record) => record.claim.claim_source === 'user');
  const droppable = [...records]
    .filter((record) => record.claim.claim_source !== 'user')
    .sort(
      (left, right) =>
        Date.parse(left.claim.proposed_at) - Date.parse(right.claim.proposed_at),
    );

  while (preserved.length + droppable.length > MAX_PENDING_PER_CUE) {
    const removableIndex = droppable.findIndex((record) => record.claim.claim_mode === 'assert');
    if (removableIndex >= 0) {
      droppable.splice(removableIndex, 1);
      continue;
    }
    droppable.shift();
  }

  return [...preserved, ...droppable].sort(
    (left, right) =>
      Date.parse(left.claim.proposed_at) - Date.parse(right.claim.proposed_at),
  );
}
