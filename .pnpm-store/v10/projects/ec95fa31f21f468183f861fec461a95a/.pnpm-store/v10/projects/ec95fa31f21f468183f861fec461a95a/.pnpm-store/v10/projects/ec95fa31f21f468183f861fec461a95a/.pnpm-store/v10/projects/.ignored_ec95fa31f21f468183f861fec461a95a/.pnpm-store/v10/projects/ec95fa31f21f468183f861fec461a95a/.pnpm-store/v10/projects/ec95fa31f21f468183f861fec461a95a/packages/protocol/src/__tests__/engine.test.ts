import { describe, expect, it } from 'vitest';

import { EngineOutputEventSchema } from '../events/engine.js';

const base = {
  revision: 10,
  timestamp: new Date().toISOString(),
  runId: 'run-e1',
  source: 'engine.claude',
};

describe('EngineOutputEventSchema', () => {
  it('parses all engine output types', () => {
    const cases = [
      { ...base, type: 'token_stream', text: 'hello', isComplete: false },
      { ...base, type: 'plan_node', nodeId: 'n1', title: 'Plan', status: 'active' },
      { ...base, type: 'diff', path: 'a.ts', patch: '@@', hunks: 1 },
    ] as const;

    for (const payload of cases) {
      expect(EngineOutputEventSchema.safeParse(payload).success).toBe(true);
    }
  });

  it('rejects invalid engine payload', () => {
    const result = EngineOutputEventSchema.safeParse({
      ...base,
      type: 'plan_node',
      nodeId: 'n1',
      title: 'Plan',
    });

    expect(result.success).toBe(false);
  });
});
