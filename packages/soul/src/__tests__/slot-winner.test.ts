import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { ClaimDraft } from '@do-what/protocol';
import { selectWinningClaim } from '../claim/slot-winner.js';

function createDraft(overrides: Partial<ClaimDraft>): ClaimDraft {
  return {
    claim_confidence: 0.5,
    claim_gist: 'draft',
    claim_mode: 'assert',
    claim_source: 'engine',
    cue_id: 'cue-1',
    draft_id: `draft-${Math.random()}`,
    proposed_at: '2026-03-08T00:00:00.000Z',
    ...overrides,
  };
}

describe('slot winner', () => {
  it('prefers user sourced claims', () => {
    const winner = selectWinningClaim([
      createDraft({ claim_confidence: 0.9, claim_source: 'engine' }),
      createDraft({ claim_confidence: 0.2, claim_source: 'user' }),
    ]);

    assert.equal(winner?.claim_source, 'user');
  });

  it('prefers retract over assert for the same cue', () => {
    const winner = selectWinningClaim([
      createDraft({ claim_confidence: 0.9, claim_mode: 'assert' }),
      createDraft({ claim_confidence: 0.1, claim_mode: 'retract' }),
    ]);

    assert.equal(winner?.claim_mode, 'retract');
  });

  it('prefers supersede over assert when source is equal', () => {
    const winner = selectWinningClaim([
      createDraft({ claim_confidence: 0.8, claim_mode: 'assert' }),
      createDraft({ claim_confidence: 0.7, claim_mode: 'supersede' }),
    ]);

    assert.equal(winner?.claim_mode, 'supersede');
  });

  it('breaks ties by confidence then recency', () => {
    const winner = selectWinningClaim([
      createDraft({
        claim_confidence: 0.6,
        draft_id: 'older',
        proposed_at: '2026-03-08T00:00:00.000Z',
      }),
      createDraft({
        claim_confidence: 0.7,
        draft_id: 'newer',
        proposed_at: '2026-03-08T01:00:00.000Z',
      }),
    ]);

    assert.equal(winner?.draft_id, 'newer');
  });
});
