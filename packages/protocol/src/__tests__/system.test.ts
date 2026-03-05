import { describe, expect, it } from 'vitest';

import { SystemHealthEventSchema } from '../events/system.js';

const base = {
  revision: 1,
  timestamp: new Date().toISOString(),
  runId: 'run-system-1',
  source: 'core',
};

describe('SystemHealthEventSchema', () => {
  it('parses all system event variants', () => {
    const cases = [
      {
        ...base,
        event: 'engine_connect',
        engineType: 'claude',
        version: '1.0.0',
      },
      {
        ...base,
        event: 'engine_disconnect',
        engineType: 'codex',
        reason: 'network_error',
      },
      {
        ...base,
        event: 'circuit_break',
        engineType: 'claude',
        failureCount: 5,
      },
      {
        ...base,
        event: 'network_status',
        online: true,
      },
    ] as const;

    for (const payload of cases) {
      expect(SystemHealthEventSchema.safeParse(payload).success).toBe(true);
    }
  });

  it('rejects unknown engineType for engine_disconnect/circuit_break', () => {
    const disconnect = SystemHealthEventSchema.safeParse({
      ...base,
      event: 'engine_disconnect',
      engineType: 'unknown-engine',
      reason: 'shutdown',
    });
    const circuitBreak = SystemHealthEventSchema.safeParse({
      ...base,
      event: 'circuit_break',
      engineType: 'unknown-engine',
      failureCount: 3,
    });

    expect(disconnect.success).toBe(false);
    expect(circuitBreak.success).toBe(false);
  });

  it('enforces ISO datetime timestamp from BaseEvent', () => {
    const result = SystemHealthEventSchema.safeParse({
      ...base,
      timestamp: 'not-a-datetime',
      event: 'network_status',
      online: false,
    });

    expect(result.success).toBe(false);
  });
});
