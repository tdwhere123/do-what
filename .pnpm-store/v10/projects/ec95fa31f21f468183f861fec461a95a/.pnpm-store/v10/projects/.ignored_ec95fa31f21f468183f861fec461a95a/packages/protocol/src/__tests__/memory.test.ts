import { describe, expect, it } from 'vitest';

import { MemoryOperationEventSchema } from '../events/memory.js';

const base = {
  revision: 11,
  timestamp: new Date().toISOString(),
  runId: 'run-m1',
  source: 'soul',
};

describe('MemoryOperationEventSchema', () => {
  it('parses all memory operations', () => {
    const cases = [
      {
        ...base,
        operation: 'search',
        query: 'event bus',
        results: [{ cueId: 'c1', gist: 'Event bus', score: 0.8, pointers: ['p1'] }],
      },
      { ...base, operation: 'open', pointer: 'ptr', level: 'hint', tokensUsed: 30 },
      {
        ...base,
        operation: 'propose',
        proposalId: 'p1',
        cueDraft: { gist: 'draft cue' },
        requiresCheckpoint: true,
      },
      { ...base, operation: 'commit', proposalId: 'p1', commitSha: 'abc123' },
    ] as const;

    for (const payload of cases) {
      expect(MemoryOperationEventSchema.safeParse(payload).success).toBe(true);
    }
  });

  it('rejects invalid memory payload', () => {
    const result = MemoryOperationEventSchema.safeParse({
      ...base,
      operation: 'open',
      pointer: 'ptr',
      level: 'hint',
    });

    expect(result.success).toBe(false);
  });
});
