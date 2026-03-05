import { describe, expect, it } from 'vitest';

import { ToolExecutionEventSchema } from '../events/tool.js';

const base = {
  revision: 2,
  timestamp: new Date().toISOString(),
  runId: 'run-2',
  source: 'hook_runner',
};

describe('ToolExecutionEventSchema', () => {
  it('parses all tool statuses', () => {
    const cases = [
      { ...base, status: 'requested', toolName: 'tools.file_read', args: { path: 'a.ts' } },
      { ...base, status: 'approved', approvedBy: 'policy' },
      { ...base, status: 'denied', reason: 'blocked' },
      { ...base, status: 'executing', pid: 1234 },
      { ...base, status: 'completed', output: 'ok', exitCode: 0 },
      { ...base, status: 'failed', error: 'crash' },
    ] as const;

    for (const item of cases) {
      expect(ToolExecutionEventSchema.safeParse(item).success).toBe(true);
    }
  });

  it('rejects invalid payload', () => {
    const result = ToolExecutionEventSchema.safeParse({
      ...base,
      status: 'requested',
      args: {},
    });

    expect(result.success).toBe(false);
  });

  it('keeps unknown fields with passthrough', () => {
    const result = ToolExecutionEventSchema.parse({
      ...base,
      status: 'denied',
      reason: 'blocked',
      debug: true,
    });

    expect(result.debug).toBe(true);
  });
});
