import { randomUUID } from 'node:crypto';
import {
  ToolsApiSchemas,
  type ToolExecutionEvent,
  type ToolsApiName,
} from '@do-what/protocol';
import type { ToolEventForwarder } from './core-forwarder.js';
import type { HookPolicyCache } from './policy-cache.js';

export interface ApprovalRequest {
  approvalId: string;
  args: Readonly<Record<string, unknown>>;
  requestedAt: string;
  runId: string;
  toolName: string;
}

export interface ApprovalResponse {
  approvalId: string;
  approved: boolean;
  pending?: boolean;
  reason?: string;
  status: 'approved' | 'denied' | 'pending' | 'timeout';
}

export interface ToolApprovalClient {
  requestApproval: (request: ApprovalRequest) => Promise<ApprovalResponse>;
}

export interface ToolExecutorResult {
  exitCode: number;
  output: string;
}

export interface ToolExecutor {
  execute: (toolName: ToolsApiName, args: Readonly<Record<string, unknown>>) => Promise<ToolExecutorResult>;
}

export interface ToolLifecycleObserver {
  onFailed?: (event: {
    reason: string;
    toolName: string;
  }) => void;
  onRequest?: (event: {
    approvalId: string;
    args: Readonly<Record<string, unknown>>;
    toolName: string;
  }) => void;
  onResolved?: (event: {
    approvalId: string;
    approved: boolean;
    reason?: string;
  }) => void;
}

export interface ToolHandlerDependencies {
  approvalClient?: ToolApprovalClient;
  cache: Pick<HookPolicyCache, 'evaluate'>;
  eventForwarder?: ToolEventForwarder;
  executor?: ToolExecutor;
  now?: () => string;
  observer?: ToolLifecycleObserver;
  runId: string;
  source?: string;
  workspaceRoot?: string;
}

export interface ToolCallResponse {
  approvalId?: string;
  error?: string;
  httpStatus: number;
  ok: boolean;
  result?: ToolExecutorResult;
  status: 'completed' | 'denied' | 'invalid' | 'pending_approval';
}

const DEFAULT_SOURCE = 'engine.claude.mcp';

function buildBaseEvent(
  dependencies: ToolHandlerDependencies,
): Pick<ToolExecutionEvent, 'revision' | 'runId' | 'source' | 'timestamp'> {
  return {
    revision: 0,
    runId: dependencies.runId,
    source: dependencies.source ?? DEFAULT_SOURCE,
    timestamp: (dependencies.now ?? (() => new Date().toISOString()))(),
  };
}

function createStubExecutor(): ToolExecutor {
  return {
    execute: async (toolName, args) => ({
      exitCode: 0,
      output: JSON.stringify({ args, ok: true, toolName }),
    }),
  };
}

async function forwardEvent(
  forwarder: ToolEventForwarder | undefined,
  event: ToolExecutionEvent,
): Promise<void> {
  await forwarder?.forward(event);
}

function buildRequestedEvent(
  dependencies: ToolHandlerDependencies,
  toolName: ToolsApiName,
  args: Readonly<Record<string, unknown>>,
): ToolExecutionEvent {
  return {
    ...buildBaseEvent(dependencies),
    args,
    status: 'requested',
    toolName,
  };
}

function buildDeniedEvent(
  dependencies: ToolHandlerDependencies,
  reason: string,
): ToolExecutionEvent {
  return {
    ...buildBaseEvent(dependencies),
    reason,
    status: 'denied',
  };
}

function buildApprovedEvent(
  dependencies: ToolHandlerDependencies,
  approvedBy: 'policy' | 'user',
): ToolExecutionEvent {
  return {
    ...buildBaseEvent(dependencies),
    approvedBy,
    status: 'approved',
  };
}

function buildExecutingEvent(
  dependencies: ToolHandlerDependencies,
): ToolExecutionEvent {
  return {
    ...buildBaseEvent(dependencies),
    status: 'executing',
  };
}

function buildCompletedEvent(
  dependencies: ToolHandlerDependencies,
  result: ToolExecutorResult,
): ToolExecutionEvent {
  return {
    ...buildBaseEvent(dependencies),
    exitCode: result.exitCode,
    output: result.output,
    status: 'completed',
  };
}

function buildFailedEvent(
  dependencies: ToolHandlerDependencies,
  error: string,
): ToolExecutionEvent {
  return {
    ...buildBaseEvent(dependencies),
    error,
    status: 'failed',
  };
}

function parseToolArguments(
  toolName: ToolsApiName,
  rawArgs: unknown,
): Readonly<Record<string, unknown>> | null {
  const parsed = ToolsApiSchemas[toolName].safeParse(rawArgs);
  return parsed.success ? parsed.data : null;
}

async function executeAllowedTool(
  toolName: ToolsApiName,
  args: Readonly<Record<string, unknown>>,
  dependencies: ToolHandlerDependencies,
  approvedBy: 'policy' | 'user',
): Promise<ToolCallResponse> {
  const executor = dependencies.executor ?? createStubExecutor();
  await forwardEvent(dependencies.eventForwarder, buildApprovedEvent(dependencies, approvedBy));
  await forwardEvent(dependencies.eventForwarder, buildExecutingEvent(dependencies));

  try {
    const result = await executor.execute(toolName, args);
    await forwardEvent(dependencies.eventForwarder, buildCompletedEvent(dependencies, result));
    return {
      httpStatus: 200,
      ok: true,
      result,
      status: 'completed',
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    dependencies.observer?.onFailed?.({ reason: message, toolName });
    await forwardEvent(dependencies.eventForwarder, buildFailedEvent(dependencies, message));
    return {
      error: message,
      httpStatus: 500,
      ok: false,
      status: 'denied',
    };
  }
}

async function resolveAskDecision(
  toolName: ToolsApiName,
  args: Readonly<Record<string, unknown>>,
  approvalId: string,
  dependencies: ToolHandlerDependencies,
): Promise<ToolCallResponse> {
  if (!dependencies.approvalClient) {
    return {
      approvalId,
      error: 'Approval required',
      httpStatus: 202,
      ok: false,
      status: 'pending_approval',
    };
  }

  const resolution = await dependencies.approvalClient.requestApproval({
    approvalId,
    args,
    requestedAt: buildBaseEvent(dependencies).timestamp,
    runId: dependencies.runId,
    toolName,
  });

  if (resolution.pending) {
    return {
      approvalId: resolution.approvalId,
      error: 'Approval required',
      httpStatus: 202,
      ok: false,
      status: 'pending_approval',
    };
  }

  dependencies.observer?.onResolved?.({
    approvalId: resolution.approvalId,
    approved: resolution.approved,
    reason: resolution.reason,
  });

  if (!resolution.approved) {
    await forwardEvent(
      dependencies.eventForwarder,
      buildDeniedEvent(dependencies, resolution.reason ?? 'Approval denied'),
    );
    return {
      approvalId: resolution.approvalId,
      error: resolution.reason ?? 'Approval denied',
      httpStatus: 403,
      ok: false,
      status: 'denied',
    };
  }

  return executeAllowedTool(toolName, args, dependencies, 'user');
}

export async function handleToolCall(
  toolName: ToolsApiName,
  rawArgs: unknown,
  dependencies: ToolHandlerDependencies,
): Promise<ToolCallResponse> {
  const args = parseToolArguments(toolName, rawArgs);
  if (!args) {
    return {
      error: 'Invalid arguments',
      httpStatus: 400,
      ok: false,
      status: 'invalid',
    };
  }

  const approvalId = randomUUID();
  dependencies.observer?.onRequest?.({
    approvalId,
    args,
    toolName,
  });

  await forwardEvent(
    dependencies.eventForwarder,
    buildRequestedEvent(dependencies, toolName, args),
  );

  const decision = dependencies.cache.evaluate(toolName, args, dependencies.workspaceRoot);
  if (decision === 'deny') {
    dependencies.observer?.onResolved?.({
      approvalId,
      approved: false,
      reason: 'Denied by policy',
    });
    await forwardEvent(
      dependencies.eventForwarder,
      buildDeniedEvent(dependencies, 'Denied by policy'),
    );
    return {
      approvalId,
      error: 'Denied by policy',
      httpStatus: 403,
      ok: false,
      status: 'denied',
    };
  }

  if (decision === 'ask') {
    return resolveAskDecision(toolName, args, approvalId, dependencies);
  }

  return executeAllowedTool(toolName, args, dependencies, 'policy');
}
