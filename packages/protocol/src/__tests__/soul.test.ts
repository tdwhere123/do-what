import { describe, expect, it } from 'vitest';
import {
  ClaimDraftSchema,
  ClaimResolutionSchema,
  MemoryCueSchema,
  SoulEventSchema,
} from '../index.js';

describe('Soul protocol schemas', () => {
  it('normalizes memory cue defaults while keeping legacy type optional', () => {
    const parsed = MemoryCueSchema.parse({
      cue_id: 'cue-1',
      gist: 'auth note',
      source: 'compiler',
    });

    expect(parsed.formation_kind).toBe('observation');
    expect(parsed.dimension).toBe('technical');
    expect(parsed.focus_surface).toBe('default');
    expect(parsed.pruned).toBe(false);
    expect(parsed.type).toBeUndefined();
  });

  it('parses claim draft and resolution payloads', () => {
    expect(
      ClaimDraftSchema.safeParse({
        claim_confidence: 0.9,
        claim_gist: 'auth contract changed',
        claim_mode: 'assert',
        claim_source: 'engine',
        cue_id: 'cue-1',
        draft_id: 'draft-1',
        proposed_at: new Date().toISOString(),
      }).success,
    ).toBe(true);

    expect(
      ClaimResolutionSchema.safeParse({
        draft_id: 'draft-1',
        resolution: 'accepted',
        resolved_at: new Date().toISOString(),
        resolver: 'slot_winner',
      }).success,
    ).toBe(true);
  });

  it('parses soul event payloads', () => {
    const success = SoulEventSchema.safeParse({
      cueId: 'cue-1',
      event: 'memory_cue_accepted',
      projectId: 'proj-1',
      revision: 1,
      runId: 'run-1',
      source: 'soul',
      timestamp: new Date().toISOString(),
    });

    expect(success.success).toBe(true);
  });
});
