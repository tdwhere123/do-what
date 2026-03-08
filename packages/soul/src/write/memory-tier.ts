import type { CueImpactLevel } from './draft-normalizer.js';

export type MemoryTier = CueImpactLevel;

export const WRITE_POLICY: Record<MemoryTier, { memory_repo: boolean; sqlite: boolean }> = {
  canon: { memory_repo: true, sqlite: true },
  consolidated: { memory_repo: false, sqlite: true },
  working: { memory_repo: false, sqlite: true },
};

export function canWriteImpactLevelToRepo(level: CueImpactLevel): boolean {
  return WRITE_POLICY[level].memory_repo;
}

