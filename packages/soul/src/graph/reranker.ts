import type { CueRef } from '@do-what/protocol';
import type { GraphCueCandidate } from './sql-filter.js';

export interface GraphRankCandidate extends GraphCueCandidate {
  edgeWeight: number;
}

function normalizeActivation(value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    return 0;
  }

  return Math.max(0, Math.min(1, value / 10));
}

function computeRecencyDecay(updatedAt: string, now: number): number {
  const updated = Date.parse(updatedAt);
  if (Number.isNaN(updated)) {
    return 0.5;
  }

  const days = Math.max(0, (now - updated) / (24 * 60 * 60 * 1000));
  return Math.max(0, Math.min(1, 1 / (1 + days / 7)));
}

function scoreCandidate(candidate: GraphRankCandidate, now: number): number {
  return Number(
    (
      normalizeActivation(candidate.activationScore) * 0.6
      + candidate.edgeWeight * 0.3
      + computeRecencyDecay(candidate.updatedAt, now) * 0.1
    ).toFixed(4),
  );
}

export function rerankGraphCandidates(
  candidates: readonly GraphRankCandidate[],
  topK: number,
  now = Date.now(),
): CueRef[] {
  return [...candidates]
    .sort((left, right) => {
      const scoreDelta = scoreCandidate(right, now) - scoreCandidate(left, now);
      if (scoreDelta !== 0) {
        return scoreDelta;
      }
      return right.activationScore - left.activationScore;
    })
    .slice(0, Math.max(0, topK))
    .map((candidate) => ({
      cueId: candidate.cueId,
      gist: candidate.gist,
      pointers: candidate.pointers,
      score: scoreCandidate(candidate, now),
      why: `graph neighbor (${candidate.edgeWeight.toFixed(2)})`,
    }));
}
