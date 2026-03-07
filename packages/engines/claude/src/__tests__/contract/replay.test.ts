import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRunActor } from '@do-what/core';
import { describe, it } from 'node:test';
import { processHookInput } from '../../hook-runner.js';
import { handleToolCall, type ToolApprovalClient } from '../../tool-handlers.js';
import {
  loadScenario,
  type ContractScenario,
} from './fixture-loader.js';

interface MemoryForwarder {
  events: Array<Record<string, unknown>>;
  forward: (event: Record<string, unknown>) => Promise<void>;
}

function createForwarder(): MemoryForwarder {
  const events: Array<Record<string, unknown>> = [];
  return {
    events,
    forward: async (event) => {
      events.push(event);
    },
  };
}

function createApprovalClient(mode: 'approve' | 'deny' | 'pending' | undefined): ToolApprovalClient | undefined {
  if (!mode) {
    return undefined;
  }

  return {
    requestApproval: async (request) => {
      if (mode === 'pending') {
        return {
          approvalId: request.approvalId,
          approved: false,
          pending: true,
          status: 'pending',
        };
      }
      if (mode === 'deny') {
        return {
          approvalId: request.approvalId,
          approved: false,
          reason: 'Denied in fixture',
          status: 'denied',
        };
      }
      return {
        approvalId: request.approvalId,
        approved: true,
        status: 'approved',
      };
    },
  };
}

function createObserver(actor: ReturnType<typeof createRunActor>) {
  return {
    onFailed: (event: { reason: string; toolName: string }) => {
      actor.send({ reason: event.reason, toolName: event.toolName, type: 'TOOL_FAILED' });
    },
    onRequest: (event: {
      approvalId: string;
      args: Readonly<Record<string, unknown>>;
      toolName: string;
    }) => {
      actor.send({
        approvalId: event.approvalId,
        args: event.args,
        toolName: event.toolName,
        type: 'TOOL_REQUEST',
      });
    },
    onResolved: (event: { approvalId: string; approved: boolean; reason?: string }) => {
      actor.send({
        approvalId: event.approvalId,
        approved: event.approved,
        reason: event.reason,
        type: 'TOOL_RESOLVED',
      });
    },
  };
}

async function replayScenario(scenario: ContractScenario): Promise<string> {
  const actor = createRunActor({
    agentStuckThreshold: 2,
    engineType: 'claude',
    policyEvaluate: () => scenario.meta.policyDecision,
    runId: scenario.meta.runId,
    workspaceId: `ws-${scenario.meta.runId}`,
  });
  actor.start();
  actor.send({ type: 'START' });

  for (const step of scenario.steps) {
    if (step.type === 'meta') {
      continue;
    }

    if (step.type === 'hook') {
      const forwarder = createForwarder();
      const result = await processHookInput(step.input, {
        cache: { evaluate: () => step.decision },
        forwarder: forwarder as never,
      });
      assert.deepEqual(result.response, step.expectedResponse);
      assert.deepEqual(forwarder.events[0], step.expectedEvent);
      continue;
    }

    if (step.type === 'mcp_call') {
      const forwarder = createForwarder();
      const timestamp = String(step.expectedEvents[0]?.timestamp);
      const result = await handleToolCall(step.toolName, step.arguments, {
        approvalClient: createApprovalClient(step.approval),
        cache: { evaluate: () => scenario.meta.policyDecision },
        eventForwarder: forwarder as never,
        now: () => timestamp,
        observer: createObserver(actor),
        runId: scenario.meta.runId,
      });
      assert.equal(result.status, step.expectedStatus);
      assert.equal(forwarder.events.length, step.expectedEvents.length);
      step.expectedEvents.forEach((expectedEvent, index) => {
        assert.deepEqual(forwarder.events[index], expectedEvent);
      });
      continue;
    }

    if (step.type === 'expect_run_state') {
      if (step.state === 'completed' && String(actor.getSnapshot().value) !== 'completed') {
        actor.send({ type: 'COMPLETE' });
      }
      assert.equal(String(actor.getSnapshot().value), step.state);
    }
  }

  return String(actor.getSnapshot().value);
}

describe('contract replay', () => {
  it('replays the readonly fixture', async () => {
    const scenario = loadScenario(
      path.resolve(
        path.dirname(fileURLToPath(import.meta.url)),
        '../../../fixtures/scenario-readonly.jsonl',
      ),
    );
    assert.equal(await replayScenario(scenario), 'completed');
  });

  it('replays the write approval fixture', async () => {
    const scenario = loadScenario(
      path.resolve(
        path.dirname(fileURLToPath(import.meta.url)),
        '../../../fixtures/scenario-write-approve.jsonl',
      ),
    );
    assert.equal(await replayScenario(scenario), 'completed');
  });

  it('replays the agent stuck fixture', async () => {
    const scenario = loadScenario(
      path.resolve(
        path.dirname(fileURLToPath(import.meta.url)),
        '../../../fixtures/scenario-agent-stuck.jsonl',
      ),
    );
    assert.equal(await replayScenario(scenario), 'interrupted');
  });
});
