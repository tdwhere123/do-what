import { describe, expect, it } from 'vitest';

import { ToolsApiJsonSchemas, ToolsApiSchemas } from '../mcp/tools-api.js';

describe('ToolsApiSchemas', () => {
  it('applies sandbox default for tools.shell_exec', () => {
    const parsed = ToolsApiSchemas['tools.shell_exec'].parse({
      command: 'echo hi',
    });

    expect(parsed.sandbox).toBe('native');
  });

  it('contains json schema for tools.shell_exec', () => {
    const schema = ToolsApiJsonSchemas['tools.shell_exec'] as {
      type?: string;
      properties?: Record<string, unknown>;
    };

    expect(schema.type).toBe('object');
    expect(schema.properties?.command).toBeDefined();
  });
});
