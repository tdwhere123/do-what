import { describe, expect, it } from 'vitest';

import { AnyEventSchema } from '../events/index.js';

const base = {
  revision: 1,
  timestamp: new Date().toISOString(),
  runId: 'run-any',
  source: 'test',
};

describe('AnyEventSchema', () => {
  it('accepts one event from each protocol event family', () => {
    const cases = [
      { ...base, status: 'created', workspaceId: 'ws-1', engineType: 'claude' },
      { ...base, status: 'requested', toolName: 'tools.shell_exec', args: { command: 'pwd' } },
      { ...base, type: 'token_stream', text: 'hello', isComplete: false },
      { ...base, operation: 'search', query: 'auth', results: [] },
      { ...base, event: 'engine_connect', engineType: 'codex', version: '1.0.0' },
      { ...base, event: 'gate_passed', workspaceId: 'ws-1' },
    ] as const;

    for (const payload of cases) {
      expect(AnyEventSchema.safeParse(payload).success).toBe(true);
    }
  });
});
