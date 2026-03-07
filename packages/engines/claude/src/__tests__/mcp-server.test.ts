import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import {
  PendingApprovalStore,
  startMcpServer,
  type ClaudeMcpServerHandle,
} from '../mcp-server.js';

const activeServers: ClaudeMcpServerHandle[] = [];

afterEach(async () => {
  while (activeServers.length > 0) {
    await activeServers.pop()?.stop();
  }
});

describe('MCP server', () => {
  it('lists all registered tools', async () => {
    const handle = await startMcpServer({
      policyCache: { evaluate: () => 'allow', load: () => ({}), stop: () => {} } as never,
      port: 0,
    });
    activeServers.push(handle);

    const response = await fetch(`${handle.url}/tools`);
    const body = (await response.json()) as { tools: Array<{ name: string }> };

    assert.equal(response.status, 200);
    assert.equal(body.tools.length, 10);
    assert.equal(body.tools.some((tool) => tool.name === 'tools.shell_exec'), true);
  });

  it('returns pending approval for ask decisions', async () => {
    const handle = await startMcpServer({
      approvalClient: new PendingApprovalStore(),
      policyCache: { evaluate: () => 'ask', load: () => ({}), stop: () => {} } as never,
      port: 0,
    });
    activeServers.push(handle);

    const response = await fetch(`${handle.url}/call`, {
      body: JSON.stringify({
        arguments: { command: 'echo hello' },
        name: 'tools.shell_exec',
      }),
      headers: {
        'Content-Type': 'application/json',
      },
      method: 'POST',
    });
    const body = (await response.json()) as { status: string };

    assert.equal(response.status, 202);
    assert.equal(body.status, 'pending_approval');
  });

  it('returns stub execution results for allow decisions', async () => {
    const events: Array<Record<string, unknown>> = [];
    const handle = await startMcpServer({
      eventForwarder: {
        forward: async (event) => {
          events.push(event as Record<string, unknown>);
        },
      },
      policyCache: { evaluate: () => 'allow', load: () => ({}), stop: () => {} } as never,
      port: 0,
    });
    activeServers.push(handle);

    const response = await fetch(`${handle.url}/call`, {
      body: JSON.stringify({
        arguments: { command: 'git status' },
        name: 'tools.shell_exec',
      }),
      headers: {
        'Content-Type': 'application/json',
      },
      method: 'POST',
    });
    const body = (await response.json()) as { ok: boolean; status: string };

    assert.equal(response.status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.status, 'completed');
    assert.deepEqual(events.map((event) => event.status), [
      'requested',
      'approved',
      'executing',
      'completed',
    ]);
  });
});
