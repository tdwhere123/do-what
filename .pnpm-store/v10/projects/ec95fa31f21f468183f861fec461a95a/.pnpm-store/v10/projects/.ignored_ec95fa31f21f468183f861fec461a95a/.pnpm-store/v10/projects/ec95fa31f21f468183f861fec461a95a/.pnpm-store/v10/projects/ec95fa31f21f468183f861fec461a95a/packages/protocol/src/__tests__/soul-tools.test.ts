import { describe, expect, it } from 'vitest';

import { SoulToolsSchemas } from '../mcp/soul-tools.js';

describe('SoulToolsSchemas', () => {
  it('validates open_pointer level enum', () => {
    const success = SoulToolsSchemas['soul.open_pointer'].safeParse({
      pointer: 'repo:src/index.ts',
      level: 'excerpt',
    });
    const fail = SoulToolsSchemas['soul.open_pointer'].safeParse({
      pointer: 'repo:src/index.ts',
      level: 'invalid',
    });

    expect(success.success).toBe(true);
    expect(fail.success).toBe(false);
  });

  it('validates review action enum', () => {
    const parsed = SoulToolsSchemas['soul.review_memory_proposal'].parse({
      proposal_id: 'p-1',
      action: 'hint_only',
    });

    expect(parsed.action).toBe('hint_only');
  });
});
