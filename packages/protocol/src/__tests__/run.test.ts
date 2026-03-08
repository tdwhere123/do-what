import { describe, expect, it } from 'vitest';

import { RunLifecycleEventSchema } from '../events/run.js';

const base = {
  revision: 1,
  timestamp: new Date().toISOString(),
  runId: 'run-1',
  source: 'core',
};

describe('RunLifecycleEventSchema', () => {
  it('parses all run statuses', () => {
    const cases = [
      { ...base, status: 'created', workspaceId: 'ws-1', engineType: 'claude' },
      { ...base, status: 'started', worktreePath: '/tmp/wt' },
      { ...base, status: 'waiting_approval', approvalId: 'a1', toolName: 'tools.shell_exec' },
      { ...base, status: 'completed', duration: 200, artifactIds: ['f1'] },
      { ...base, status: 'failed', error: 'boom', code: 'E_FAIL' },
      { ...base, status: 'cancelled', cancelledBy: 'user' },
      { ...base, status: 'interrupted', reason: 'agent_stuck' },
      { ...base, status: 'governance_invalid', reason: 'lease invalidated' },
    ] as const;

    for (const item of cases) {
      expect(RunLifecycleEventSchema.safeParse(item).success).toBe(true);
    }
  });

  it('rejects invalid payload', () => {
    const result = RunLifecycleEventSchema.safeParse({
      ...base,
      status: 'created',
      engineType: 'codex',
    });

    expect(result.success).toBe(false);
  });

  it('keeps unknown fields with passthrough', () => {
    const result = RunLifecycleEventSchema.parse({
      ...base,
      status: 'created',
      workspaceId: 'ws-1',
      engineType: 'claude',
      extraField: 'keep-me',
    });

    expect(result.extraField).toBe('keep-me');
  });
});
