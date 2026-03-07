import { describe, expect, it } from 'vitest';

import { IntegrationEventSchema } from '../events/integration.js';

const base = {
  revision: 1,
  runId: 'run-integration-1',
  source: 'core.integrator',
  timestamp: new Date().toISOString(),
  workspaceId: 'ws-1',
};

describe('IntegrationEventSchema', () => {
  it('parses all integration event variants', () => {
    const cases = [
      {
        ...base,
        afterErrorCount: 0,
        baselineErrorCount: 0,
        event: 'gate_passed',
        touchedPaths: ['packages/core/src/index.ts'],
      },
      {
        ...base,
        afterErrorCount: 3,
        baselineErrorCount: 1,
        event: 'gate_failed',
        newDiagnostics: ['packages/core/src/index.ts: error TS2322'],
        touchedPaths: ['packages/core/src/index.ts'],
      },
      {
        ...base,
        event: 'conflict',
        reason: 'git apply failed',
        touchedPaths: ['packages/core/src/index.ts'],
      },
      {
        ...base,
        affectedRunIds: ['run-2', 'run-3'],
        event: 'replay_requested',
        touchedPaths: ['packages/core/src/index.ts'],
      },
    ] as const;

    for (const payload of cases) {
      expect(IntegrationEventSchema.safeParse(payload).success).toBe(true);
    }
  });

  it('rejects missing required gate failure fields', () => {
    const result = IntegrationEventSchema.safeParse({
      ...base,
      event: 'gate_failed',
      touchedPaths: ['packages/core/src/index.ts'],
    });

    expect(result.success).toBe(false);
  });

  it('keeps unknown fields with passthrough', () => {
    const result = IntegrationEventSchema.parse({
      ...base,
      event: 'gate_passed',
      extraField: 'keep-me',
    });

    expect(result.extraField).toBe('keep-me');
  });
});
