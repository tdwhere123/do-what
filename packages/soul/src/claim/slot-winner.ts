import type { ClaimDraft } from '@do-what/protocol';

function getModePriority(mode: ClaimDraft['claim_mode']): number {
  switch (mode) {
    case 'retract':
      return 3;
    case 'supersede':
      return 2;
    case 'assert':
    default:
      return 1;
  }
}

function compareClaimDrafts(left: ClaimDraft, right: ClaimDraft): number {
  if (left.claim_source === 'user' && right.claim_source !== 'user') {
    return -1;
  }
  if (right.claim_source === 'user' && left.claim_source !== 'user') {
    return 1;
  }

  const modePriorityDiff = getModePriority(right.claim_mode) - getModePriority(left.claim_mode);
  if (modePriorityDiff !== 0) {
    return modePriorityDiff;
  }

  const confidenceDiff = right.claim_confidence - left.claim_confidence;
  if (confidenceDiff !== 0) {
    return confidenceDiff;
  }

  return Date.parse(right.proposed_at) - Date.parse(left.proposed_at);
}

export function selectWinningClaim(
  drafts: readonly ClaimDraft[],
): ClaimDraft | null {
  if (drafts.length === 0) {
    return null;
  }

  return [...drafts].sort(compareClaimDrafts)[0] ?? null;
}
