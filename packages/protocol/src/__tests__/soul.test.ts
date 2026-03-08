import { describe, expect, it } from 'vitest';
import {
  ClaimDraftSchema,
  ClaimResolutionSchema,
  EvidenceCapsuleSchema,
  MemoryCueSchema,
  SoulEventSchema,
  UserDecisionSchema,
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

  it('parses user decision payloads', () => {
    const parsed = UserDecisionSchema.safeParse({
      claim_draft_id: 'draft-1',
      context_snapshot: {
        cue_gist: 'auth note',
        formation_kind: 'observation',
        run_id: 'run-1',
        workspace_id: 'proj-1',
      },
      decision_id: 'decision-1',
      decision_type: 'accept',
      linked_capsule_id: 'capsule-1',
      linked_memory_id: 'cue-1',
      timestamp: new Date().toISOString(),
      user_note: 'looks good',
    });

    expect(parsed.success).toBe(true);
  });

  it('enforces evidence capsule limits', () => {
    const parsed = EvidenceCapsuleSchema.safeParse({
      capsule_id: 'capsule-1',
      confidence: 0.8,
      context_fingerprint: 'fp',
      created_at: new Date().toISOString(),
      cue_id: 'cue-1',
      git_commit: 'abcdef1',
      repo_path: 'src/auth.ts',
      snippet_excerpt: 'export function authenticate() {}',
    });

    expect(parsed.success).toBe(true);
  });
});
