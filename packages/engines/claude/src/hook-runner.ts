import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  ToolCompletedEvent,
  ToolExecutionEvent,
  ToolFailedEvent,
  ToolRequestedEvent,
} from '@do-what/protocol';
import {
  createCoreToolEventForwarder,
  type ToolEventForwarder,
} from './core-forwarder.js';
import {
  HookPolicyCache,
  getDefaultHookPolicyCachePath,
} from './policy-cache.js';

type HookAction = 'allow' | 'deny';
type HookEventName = 'PostToolUse' | 'PreToolUse' | 'Stop' | 'unknown';

const DEFAULT_DENY_FEEDBACK = 'Use do-what MCP tools instead of native Claude tools.';
const DEFAULT_SOURCE = 'engine.claude.hook-runner';

interface RawHookPayload {
  args?: Record<string, unknown>;
  command?: string;
  error?: string;
  eventType?: string;
  exitCode?: number;
  hook_event_name?: string;
  hookEventName?: string;
  output?: string;
  runId?: string;
  source?: string;
  timestamp?: string;
  tool?: string;
  toolName?: string;
  [key: string]: unknown;
}

export interface HookRunnerResponse {
  action: HookAction;
  feedback?: string;
}

export interface HookRunnerDependencies {
  cache: Pick<HookPolicyCache, 'evaluate'>;
  denyFeedback?: string;
  forwarder?: ToolEventForwarder;
  now?: () => string;
  runId?: string;
  source?: string;
}

export interface HookProcessResult {
  forwardedEvent?: ToolExecutionEvent;
  response: HookRunnerResponse;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asInteger(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isInteger(value)) {
    return value;
  }
  return undefined;
}

function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    let buffer = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk: string) => {
      buffer += chunk;
    });
    process.stdin.on('end', () => resolve(buffer));
    process.stdin.on('error', reject);
  });
}

function parseHookPayload(input: string | RawHookPayload): RawHookPayload {
  return typeof input === 'string'
    ? (JSON.parse(input.trim()) as RawHookPayload)
    : input;
}

function getHookEventName(payload: RawHookPayload): HookEventName {
  const raw = payload.hook_event_name ?? payload.hookEventName ?? payload.eventType;
  if (raw === 'PreToolUse' || raw === 'PostToolUse' || raw === 'Stop') {
    return raw;
  }

  if (payload.output !== undefined || payload.exitCode !== undefined || payload.error !== undefined) {
    return 'PostToolUse';
  }
  if (payload.tool || payload.toolName) {
    return 'PreToolUse';
  }
  return 'unknown';
}

function mapClaudeToolName(rawTool: string | undefined): string {
  if (!rawTool) {
    return 'tools.shell_exec';
  }
  if (rawTool.startsWith('tools.')) {
    return rawTool;
  }

  switch (rawTool.toLowerCase()) {
    case 'bash':
      return 'tools.shell_exec';
    case 'edit':
    case 'multiedit':
      return 'tools.file_patch';
    case 'glob':
    case 'ls':
    case 'read':
      return 'tools.file_read';
    case 'webfetch':
      return 'tools.web_fetch';
    case 'write':
      return 'tools.file_write';
    default:
      return rawTool;
  }
}

function buildBaseEvent(
  payload: RawHookPayload,
  now: () => string,
  source: string,
  runId?: string,
): Pick<ToolExecutionEvent, 'revision' | 'runId' | 'source' | 'timestamp'> {
  return {
    revision: 0,
    runId: payload.runId ?? runId ?? `claude-hook-${randomUUID()}`,
    source: payload.source ?? source,
    timestamp: payload.timestamp ?? now(),
  };
}

function buildRequestedEvent(
  payload: RawHookPayload,
  now: () => string,
  source: string,
  runId?: string,
): ToolRequestedEvent {
  const args = asRecord(payload.args);
  if (Object.keys(args).length === 0 && typeof payload.command === 'string') {
    args.command = payload.command;
  }

  return {
    ...buildBaseEvent(payload, now, source, runId),
    args,
    hookEventName: getHookEventName(payload),
    rawToolName: payload.tool ?? payload.toolName,
    status: 'requested',
    toolName: mapClaudeToolName(payload.tool ?? payload.toolName),
  };
}

function buildPostToolEvent(
  payload: RawHookPayload,
  now: () => string,
  source: string,
  runId?: string,
): ToolCompletedEvent | ToolFailedEvent {
  const toolName = mapClaudeToolName(payload.tool ?? payload.toolName);
  const baseEvent = {
    ...buildBaseEvent(payload, now, source, runId),
    hookEventName: getHookEventName(payload),
    rawToolName: payload.tool ?? payload.toolName,
    toolName,
  };

  if (typeof payload.error === 'string' || (payload.exitCode ?? 0) !== 0) {
    return {
      ...baseEvent,
      error: payload.error ?? `Tool exited with code ${payload.exitCode ?? 1}`,
      status: 'failed',
    };
  }

  return {
    ...baseEvent,
    exitCode: asInteger(payload.exitCode) ?? 0,
    output: typeof payload.output === 'string' ? payload.output : '',
    status: 'completed',
  };
}

function allowResponse(): HookRunnerResponse {
  return { action: 'allow' };
}

function denyResponse(feedback: string): HookRunnerResponse {
  return {
    action: 'deny',
    feedback,
  };
}

export async function processHookInput(
  input: string | RawHookPayload,
  dependencies: HookRunnerDependencies,
): Promise<HookProcessResult> {
  let payload: RawHookPayload;
  try {
    payload = parseHookPayload(input);
  } catch (error) {
    console.warn('[claude][hook-runner] invalid JSON payload, allowing request', error);
    return { response: allowResponse() };
  }

  const hookEventName = getHookEventName(payload);
  const now = dependencies.now ?? (() => new Date().toISOString());
  const source = dependencies.source ?? DEFAULT_SOURCE;

  if (hookEventName === 'PostToolUse') {
    const forwardedEvent = buildPostToolEvent(payload, now, source, dependencies.runId);
    void dependencies.forwarder?.forward(forwardedEvent);
    return {
      forwardedEvent,
      response: allowResponse(),
    };
  }

  if (hookEventName !== 'PreToolUse') {
    return { response: allowResponse() };
  }

  const forwardedEvent = buildRequestedEvent(payload, now, source, dependencies.runId);
  void dependencies.forwarder?.forward(forwardedEvent);

  const requestedEvent = forwardedEvent as {
    args: Readonly<Record<string, unknown>>;
    toolName: string;
  };
  const decision = dependencies.cache.evaluate(requestedEvent.toolName, requestedEvent.args);
  if (decision === 'deny') {
    return {
      forwardedEvent,
      response: denyResponse(dependencies.denyFeedback ?? DEFAULT_DENY_FEEDBACK),
    };
  }

  return {
    forwardedEvent,
    response: allowResponse(),
  };
}

async function runAsCli(): Promise<void> {
  const cache = new HookPolicyCache({
    cachePath: process.env.DOWHAT_POLICY_CACHE_PATH ?? getDefaultHookPolicyCachePath(),
    watch: false,
    workspaceRoot: process.env.DOWHAT_WORKSPACE_ROOT,
  });
  cache.load();

  const input = await readStdin();
  const result = await processHookInput(input, {
    cache,
    forwarder: createCoreToolEventForwarder(),
    runId: process.env.DOWHAT_RUN_ID,
    source: process.env.DOWHAT_HOOK_SOURCE ?? DEFAULT_SOURCE,
  });
  process.stdout.write(`${JSON.stringify(result.response)}\n`);
  cache.stop();
}

const entryPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (entryPath === path.resolve(fileURLToPath(import.meta.url))) {
  void runAsCli().catch((error) => {
    console.error('[claude][hook-runner] failed', error);
    process.stdout.write(`${JSON.stringify(allowResponse())}\n`);
    process.exitCode = 1;
  });
}


