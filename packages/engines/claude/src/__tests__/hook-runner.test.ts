import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { processHookInput } from '../hook-runner.js';

function createForwarder() {
  const events: Array<Record<string, unknown>> = [];
  return {
    events,
    forwarder: {
      forward: async (event: Record<string, unknown>) => {
        events.push(event);
      },
    },
  };
}

describe('hook-runner', () => {
  it('denies native Bash when policy denies shell_exec', async () => {
    const forwarder = createForwarder();
    const result = await processHookInput(
      {
        args: { command: 'rm -rf tmp' },
        runId: 'run-deny',
        timestamp: '2026-03-06T00:00:00.000Z',
        tool: 'Bash',
      },
      {
        cache: { evaluate: () => 'deny' },
        forwarder: forwarder.forwarder as never,
      },
    );

    assert.equal(result.response.action, 'deny');
    assert.match(result.response.feedback ?? '', /do-what MCP tools/);
    assert.deepEqual(
      {
        runId: (forwarder.events[0] as Record<string, unknown>).runId,
        status: (forwarder.events[0] as Record<string, unknown>).status,
        toolName: (forwarder.events[0] as Record<string, unknown>).toolName,
      },
      {
        runId: 'run-deny',
        status: 'requested',
        toolName: 'tools.shell_exec',
      },
    );
  });

  it('allows ask decisions to avoid blocking Claude hooks', async () => {
    const result = await processHookInput(
      {
        args: { command: 'echo hello' },
        runId: 'run-ask',
        timestamp: '2026-03-06T00:00:00.000Z',
        tool: 'Bash',
      },
      {
        cache: { evaluate: () => 'ask' },
      },
    );

    assert.deepEqual(result.response, { action: 'allow' });
  });

  it('forwards post-tool completion events', async () => {
    const forwarder = createForwarder();
    const result = await processHookInput(
      {
        exitCode: 0,
        output: 'ok',
        runId: 'run-post',
        timestamp: '2026-03-06T00:00:01.000Z',
        tool: 'Bash',
      },
      {
        cache: { evaluate: () => 'allow' },
        forwarder: forwarder.forwarder as never,
      },
    );

    assert.deepEqual(result.response, { action: 'allow' });
    assert.deepEqual(
      {
        exitCode: (forwarder.events[0] as Record<string, unknown>).exitCode,
        output: (forwarder.events[0] as Record<string, unknown>).output,
        runId: (forwarder.events[0] as Record<string, unknown>).runId,
        status: (forwarder.events[0] as Record<string, unknown>).status,
      },
      {
        exitCode: 0,
        output: 'ok',
        runId: 'run-post',
        status: 'completed',
      },
    );
  });
});
