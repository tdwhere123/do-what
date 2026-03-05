import { describe, expect, it } from 'vitest';

import {
  DEFAULT_POLICY,
  HookPolicyCacheSchema,
  PolicyConfigSchema,
  PolicyRuleSchema,
} from '../index.js';

describe('Policy schemas', () => {
  it('parses a policy rule', () => {
    const parsed = PolicyRuleSchema.parse({
      default: 'ask',
      allow_commands: ['git status'],
    });

    expect(parsed.default).toBe('ask');
    expect(parsed.allow_commands).toEqual(['git status']);
  });

  it('parses default policy map', () => {
    const parsed = PolicyConfigSchema.parse(DEFAULT_POLICY);
    expect(parsed['tools.file_read']?.default).toBe('allow');
    expect(parsed['tools.shell_exec']?.default).toBe('ask');
  });

  it('parses hook policy cache payload', () => {
    const parsed = HookPolicyCacheSchema.parse({
      version: '1',
      updatedAt: new Date().toISOString(),
      rules: DEFAULT_POLICY,
    });

    expect(parsed.rules['tools.web_fetch']?.default).toBe('ask');
  });
});
