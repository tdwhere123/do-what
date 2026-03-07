import fs from 'node:fs';
import path from 'node:path';
import {
  RunLifecycleEventSchema,
  ToolExecutionEventSchema,
  type ToolsApiName,
} from '@do-what/protocol';

export interface ContractMetaStep {
  claudeCliVersion: string;
  policyDecision: 'allow' | 'ask' | 'deny';
  runId: string;
  type: 'meta';
}

export interface ContractHookStep {
  decision: 'allow' | 'ask' | 'deny';
  expectedEvent: Record<string, unknown>;
  expectedResponse: { action: 'allow' | 'deny'; feedback?: string };
  input: Record<string, unknown>;
  type: 'hook';
}

export interface ContractMcpCallStep {
  approval?: 'approve' | 'deny' | 'pending';
  arguments: Record<string, unknown>;
  expectedEvents: Record<string, unknown>[];
  expectedStatus: 'completed' | 'denied' | 'pending_approval';
  toolName: ToolsApiName;
  type: 'mcp_call';
}

export interface ContractExpectedStateStep {
  state: string;
  type: 'expect_run_state';
}

export type ContractStep =
  | ContractMetaStep
  | ContractHookStep
  | ContractMcpCallStep
  | ContractExpectedStateStep;

export interface ContractScenario {
  meta: ContractMetaStep;
  steps: ContractStep[];
}

function warnOnVersionMismatch(recordedVersion: string): void {
  const currentVersion = process.env.DOWHAT_CLAUDE_CLI_VERSION;
  if (currentVersion && currentVersion !== recordedVersion) {
    console.warn(
      `[claude][contract] fixture recorded with ${recordedVersion}, current CLI is ${currentVersion}`,
    );
  }
}

function parseLine(line: string, lineNumber: number): ContractStep {
  const parsed = JSON.parse(line) as ContractStep;
  if (parsed.type === 'hook') {
    ToolExecutionEventSchema.parse(parsed.expectedEvent);
  }
  if (parsed.type === 'mcp_call') {
    parsed.expectedEvents.forEach((event) => {
      ToolExecutionEventSchema.parse(event);
    });
  }
  if (parsed.type === 'expect_run_state') {
    RunLifecycleEventSchema.safeParse({
      reason: 'agent_stuck',
      revision: 0,
      runId: 'fixture',
      source: 'fixture',
      status: parsed.state === 'interrupted' ? 'interrupted' : 'completed',
      timestamp: '2026-03-06T00:00:00.000Z',
    });
  }
  if (parsed.type === 'meta') {
    return parsed;
  }
  if (parsed.type === 'hook' || parsed.type === 'mcp_call' || parsed.type === 'expect_run_state') {
    return parsed;
  }

  throw new Error(`Unknown fixture step type at line ${lineNumber}`);
}

export function loadScenario(filePath: string): ContractScenario {
  const lines = fs
    .readFileSync(filePath, 'utf8')
    .trim()
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0);
  const steps = lines.map((line, index) => parseLine(line, index + 1));
  const meta = steps.find((step): step is ContractMetaStep => step.type === 'meta');
  if (!meta) {
    throw new Error(`Fixture ${path.basename(filePath)} is missing meta step`);
  }

  warnOnVersionMismatch(meta.claudeCliVersion);

  return {
    meta,
    steps,
  };
}
