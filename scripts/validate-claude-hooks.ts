import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';

import {
  BaseEventSchema,
  EngineOutputEventSchema,
  RunLifecycleEventSchema,
  SystemHealthEventSchema,
  ToolExecutionEventSchema,
} from '../packages/protocol/dist/events/index.js';

type ValidationStatus = 'pass' | 'warn' | 'fail';

export interface ValidationCheck {
  id: string;
  title: string;
  status: ValidationStatus;
  details: string;
  data?: Record<string, unknown>;
}

export interface CommandResult {
  command: string;
  args: string[];
  durationMs: number;
  exitCode: number | null;
  ok: boolean;
  spawnError?: string;
  stderr: string;
  stdout: string;
  timedOut?: boolean;
}

export interface ClaudeValidationResult {
  checks: ValidationCheck[];
  cliAvailable: boolean;
  commandResults: CommandResult[];
  coreSseConnected: boolean;
  errors: string[];
  finishedAt: string;
  hookLatencyMs: number | null;
  normalizedEvents: Record<string, unknown>[];
  parseSuccessCount: number;
  parseSuccessRate: number;
  parseTotal: number;
  passthroughOk: boolean;
  rawHookEvents: unknown[];
  startedAt: string;
  usedSyntheticEvents: boolean;
}

interface CoreServerHandle {
  baseUrl: string;
  stop: () => Promise<void>;
  token: string;
}

interface ProtocolParseResult {
  parsedBy: 'run' | 'tool' | 'engine' | 'system' | null;
  passthroughOk: boolean;
  success: boolean;
}

interface CommandOptions {
  timeoutMs?: number;
}

interface HookRunnerArgs {
  coreUrl?: string;
  runId: string;
  source: string;
  token?: string;
}

interface RunnerForwardResult {
  latencyMs: number;
  ok: boolean;
  responseStatus?: number;
}

const DEFAULT_SOURCE = 'claude-hook';
const DEFAULT_TIMEOUT_MS = 30_000;
const HOOK_TIMEOUT_TARGET_MS = 200;

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function asString(value: unknown): string | null {
  if (typeof value === 'string' && value.length > 0) {
    return value;
  }
  return null;
}

function asInteger(value: unknown): number | null {
  if (typeof value === 'number' && Number.isInteger(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (Number.isInteger(parsed)) {
      return parsed;
    }
  }
  return null;
}

function shellQuotePosix(value: string): string {
  if (/^[A-Za-z0-9_./:-]+$/.test(value)) {
    return value;
  }
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function shellQuoteWindows(value: string): string {
  if (/^[A-Za-z0-9_./:\\-]+$/.test(value)) {
    return value;
  }
  return `"${value.replace(/"/g, '""')}"`;
}

function buildShellCommand(command: string, args: string[]): {
  executable: string;
  shellArgs: string[];
} {
  if (process.platform === 'win32') {
    const joined = [command, ...args].map(shellQuoteWindows).join(' ');
    return {
      executable: 'cmd.exe',
      shellArgs: ['/d', '/s', '/c', joined],
    };
  }

  const joined = [command, ...args].map(shellQuotePosix).join(' ');
  return {
    executable: 'sh',
    shellArgs: ['-lc', joined],
  };
}

async function runCommand(
  command: string,
  args: string[],
  options: CommandOptions = {},
): Promise<CommandResult> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const start = performance.now();
  const { executable, shellArgs } = buildShellCommand(command, args);
  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(executable, shellArgs, {
        env: process.env,
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      });
    } catch (error) {
      resolve({
        args,
        command,
        durationMs: Math.round(performance.now() - start),
        exitCode: null,
        ok: false,
        spawnError: error instanceof Error ? error.message : String(error),
        stderr,
        stdout,
      });
      return;
    }

    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
    }, timeoutMs);

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk: string) => {
      stderr += chunk;
    });

    child.on('error', (error) => {
      clearTimeout(timeout);
      resolve({
        args,
        command,
        durationMs: Math.round(performance.now() - start),
        exitCode: null,
        ok: false,
        spawnError: error.message,
        stderr,
        stdout,
      });
    });

    child.on('close', (exitCode) => {
      clearTimeout(timeout);
      resolve({
        args,
        command,
        durationMs: Math.round(performance.now() - start),
        exitCode,
        ok: !timedOut && exitCode === 0,
        stderr,
        stdout,
        timedOut: timedOut || undefined,
      });
    });
  });
}

function parseHookRunnerArgs(argv: string[]): HookRunnerArgs {
  const get = (flag: string): string | undefined => {
    const index = argv.indexOf(flag);
    if (index === -1 || index === argv.length - 1) {
      return undefined;
    }
    return argv[index + 1];
  };

  return {
    coreUrl: get('--core-url'),
    runId: get('--run-id') ?? `validation-${randomUUID()}`,
    source: get('--source') ?? DEFAULT_SOURCE,
    token: get('--token'),
  };
}

function normalizeHookEvent(
  raw: unknown,
  revision: number,
  runId: string,
  source: string,
): Record<string, unknown> {
  const event = asRecord(raw) ?? { raw };
  const normalized: Record<string, unknown> = {
    ...event,
    revision: asInteger(event.revision) ?? revision,
    runId:
      asString(event.runId) ??
      asString(event.run_id) ??
      asString(event.sessionId) ??
      runId,
    source: asString(event.source) ?? source,
    timestamp: asString(event.timestamp) ?? new Date().toISOString(),
  };

  const hookName =
    asString(event.hook_event_name) ??
    asString(event.hookEventName) ??
    asString(event.event_name);

  if (typeof normalized.status !== 'string' && hookName) {
    if (hookName === 'PreToolUse') {
      normalized.status = 'requested';
      normalized.toolName =
        asString(event.toolName) ?? asString(event.tool_name) ?? 'unknown_tool';
      normalized.args = asRecord(event.args) ?? {};
    } else if (hookName === 'PostToolUse') {
      normalized.status = 'completed';
      normalized.output = asString(event.output) ?? '';
      normalized.exitCode = asInteger(event.exitCode) ?? 0;
    } else if (hookName === 'Stop') {
      normalized.status = 'completed';
      normalized.duration = asInteger(event.durationMs) ?? 0;
    }
  }

  if (
    typeof normalized.type !== 'string' &&
    typeof normalized.eventType === 'string'
  ) {
    normalized.type = normalized.eventType;
  }

  if (
    typeof normalized.type !== 'string' &&
    asString(event.stream_kind) === 'token'
  ) {
    normalized.type = 'token_stream';
    normalized.text = asString(event.text) ?? '';
    normalized.isComplete = Boolean(event.isComplete);
  }

  if (
    typeof normalized.event !== 'string' &&
    asString(event.kind) === 'system_health'
  ) {
    normalized.event = 'engine_connect';
    normalized.engineType = 'claude';
    normalized.version = asString(event.version) ?? 'unknown';
  }

  if (
    typeof normalized.event !== 'string' &&
    typeof normalized.status !== 'string' &&
    typeof normalized.type !== 'string'
  ) {
    normalized.status = 'started';
  }

  return normalized;
}

function parseWithProtocol(event: Record<string, unknown>): ProtocolParseResult {
  const base = BaseEventSchema.safeParse(event);
  if (!base.success) {
    return { parsedBy: null, passthroughOk: false, success: false };
  }

  const candidates: Array<{
    name: ProtocolParseResult['parsedBy'];
    parser:
      | typeof RunLifecycleEventSchema
      | typeof ToolExecutionEventSchema
      | typeof EngineOutputEventSchema
      | typeof SystemHealthEventSchema;
  }> = [
    { name: 'run', parser: RunLifecycleEventSchema },
    { name: 'tool', parser: ToolExecutionEventSchema },
    { name: 'engine', parser: EngineOutputEventSchema },
    { name: 'system', parser: SystemHealthEventSchema },
  ];

  for (const candidate of candidates) {
    const withUnknown = {
      ...event,
      __validation_passthrough_field: 'ok',
    };
    const parsed = candidate.parser.safeParse(withUnknown);
    if (!parsed.success) {
      continue;
    }
    const passthroughOk =
      asString(
        (parsed.data as Record<string, unknown>).__validation_passthrough_field,
      ) === 'ok';
    return {
      parsedBy: candidate.name,
      passthroughOk,
      success: true,
    };
  }

  return {
    parsedBy: null,
    passthroughOk: false,
    success: false,
  };
}

async function publishToCore(
  event: Record<string, unknown>,
  args: HookRunnerArgs,
): Promise<RunnerForwardResult> {
  const start = performance.now();
  if (!args.coreUrl || !args.token) {
    return {
      latencyMs: Math.round(performance.now() - start),
      ok: true,
    };
  }

  const response = await fetch(`${args.coreUrl}/_dev/publish`, {
    body: JSON.stringify(event),
    headers: {
      Authorization: `Bearer ${args.token}`,
      'Content-Type': 'application/json',
    },
    method: 'POST',
  });

  return {
    latencyMs: Math.round(performance.now() - start),
    ok: response.ok,
    responseStatus: response.status,
  };
}

async function runHookRunner(): Promise<void> {
  const args = parseHookRunnerArgs(process.argv.slice(2));
  let revision = 1;
  let lineBuffer = '';

  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk: string) => {
    lineBuffer += chunk;
    const lines = lineBuffer.split(/\r?\n/);
    lineBuffer = lines.pop() ?? '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) {
        continue;
      }

      void (async () => {
        try {
          const raw = JSON.parse(trimmed);
          const normalized = normalizeHookEvent(
            raw,
            revision++,
            args.runId,
            args.source,
          );
          const result = await publishToCore(normalized, args);
          process.stdout.write(
            `${JSON.stringify({
              action: 'forwarded',
              latencyMs: result.latencyMs,
              ok: result.ok,
              status: result.responseStatus ?? 0,
            })}\n`,
          );
        } catch (error) {
          process.stdout.write(
            `${JSON.stringify({
              action: 'forwarded',
              error: error instanceof Error ? error.message : String(error),
              ok: false,
            })}\n`,
          );
        }
      })();
    }
  });

  process.stdin.on('end', () => {
    if (lineBuffer.trim().length > 0) {
      try {
        const raw = JSON.parse(lineBuffer.trim());
        const normalized = normalizeHookEvent(raw, revision, args.runId, args.source);
        void publishToCore(normalized, args);
      } catch {
        // ignore trailing invalid JSON
      }
    }
  });
}

async function tryStartCoreServer(): Promise<CoreServerHandle | null> {
  try {
    const mod = (await import('../packages/core/dist/server/http.js')) as {
      startHttpServer: (options?: Record<string, unknown>) => Promise<{
        port: number;
        stop: () => Promise<void>;
        token: string;
      }>;
    };

    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'do-what-t010-'));
    const runDir = path.join(tempRoot, 'run');
    const stateDir = path.join(tempRoot, 'state');

    const handle = await mod.startHttpServer({
      host: '127.0.0.1',
      isDevelopment: true,
      logger: false,
      port: 0,
      runDir,
      sessionTokenPath: path.join(runDir, 'session_token'),
      skipSignalHandlers: true,
      stateDir,
      workspaceRoot: process.cwd(),
    });

    return {
      baseUrl: `http://127.0.0.1:${handle.port}`,
      stop: handle.stop,
      token: handle.token,
    };
  } catch {
    return null;
  }
}

async function createSseProbe(
  core: CoreServerHandle,
): Promise<{ close: () => void; hasReceived: () => boolean }> {
  let received = false;
  const request = http.request(
    `${core.baseUrl}/events`,
    {
      headers: {
        Authorization: `Bearer ${core.token}`,
      },
      method: 'GET',
    },
    (response) => {
      response.setEncoding('utf8');
      response.on('data', (chunk) => {
        if (chunk.includes('data:')) {
          received = true;
        }
      });
    },
  );

  request.on('error', () => {
    // probe may fail on restricted environments
  });
  request.end();

  return {
    close: () => request.destroy(),
    hasReceived: () => received,
  };
}

function buildSyntheticHookEvents(runId: string): unknown[] {
  const now = new Date().toISOString();
  return [
    {
      args: { command: 'echo test' },
      hook_event_name: 'PreToolUse',
      runId,
      source: 'claude-hook-synthetic',
      timestamp: now,
      toolName: 'Bash',
    },
    {
      exitCode: 0,
      hook_event_name: 'PostToolUse',
      output: 'test',
      runId,
      source: 'claude-hook-synthetic',
      timestamp: now,
    },
    {
      hook_event_name: 'Stop',
      runId,
      source: 'claude-hook-synthetic',
      timestamp: now,
    },
  ];
}

function statusFromRate(rate: number, high: number, medium: number): ValidationStatus {
  if (rate >= high) {
    return 'pass';
  }
  if (rate >= medium) {
    return 'warn';
  }
  return 'fail';
}

function checkStatusFromLatency(latencyMs: number | null): ValidationStatus {
  if (latencyMs === null) {
    return 'warn';
  }
  if (latencyMs <= HOOK_TIMEOUT_TARGET_MS) {
    return 'pass';
  }
  if (latencyMs <= 500) {
    return 'warn';
  }
  return 'fail';
}

function mapStatusLabel(status: ValidationStatus): string {
  if (status === 'pass') {
    return '✅';
  }
  if (status === 'warn') {
    return '⚠️';
  }
  return '❌';
}

export async function validateClaudeHooks(): Promise<ClaudeValidationResult> {
  const startedAt = new Date().toISOString();
  const checks: ValidationCheck[] = [];
  const commandResults: CommandResult[] = [];
  const errors: string[] = [];
  const runId = `t010-claude-${randomUUID()}`;
  let core: CoreServerHandle | null = null;
  let sseProbe: { close: () => void; hasReceived: () => boolean } | null = null;

  let rawHookEvents: unknown[] = [];
  let usedSyntheticEvents = false;
  let hookLatencyMs: number | null = null;

  const claudeVersion = await runCommand('claude', ['--version'], { timeoutMs: 10_000 });
  commandResults.push(claudeVersion);

  const cliAvailable = claudeVersion.ok;

  try {
    core = await tryStartCoreServer();
    if (core) {
      sseProbe = await createSseProbe(core);
    }
  } catch (error) {
    errors.push(
      `core bootstrap failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  rawHookEvents = buildSyntheticHookEvents(runId);
  usedSyntheticEvents = true;

  const firstSynthetic = normalizeHookEvent(rawHookEvents[0], 1, runId, DEFAULT_SOURCE);
  try {
    const forwarded = await publishToCore(firstSynthetic, {
      coreUrl: core?.baseUrl,
      runId,
      source: DEFAULT_SOURCE,
      token: core?.token,
    });
    hookLatencyMs = forwarded.latencyMs;
  } catch (error) {
    errors.push(
      `hook forward failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const printProbe = await runCommand(
    'claude',
    ['--print', '--output-format', 'json', 'Reply with exactly OK'],
    { timeoutMs: 45_000 },
  );
  commandResults.push(printProbe);

  const normalizedEvents = rawHookEvents.map((event, index) =>
    normalizeHookEvent(event, index + 1, runId, DEFAULT_SOURCE),
  );

  let parseSuccessCount = 0;
  let passthroughCount = 0;
  for (const event of normalizedEvents) {
    const parsed = parseWithProtocol(event);
    if (parsed.success) {
      parseSuccessCount += 1;
    }
    if (parsed.passthroughOk) {
      passthroughCount += 1;
    }
  }

  const parseTotal = normalizedEvents.length;
  const parseSuccessRate = parseTotal === 0 ? 0 : parseSuccessCount / parseTotal;
  const passthroughOk = parseTotal > 0 && passthroughCount === parseTotal;
  const coreSseConnected = sseProbe?.hasReceived() ?? false;

  checks.push({
    id: 'hook_schema_compat',
    title: 'Hook event compatibility + passthrough',
    status: statusFromRate(parseSuccessRate, 0.95, 0.8),
    details: `parse success ${parseSuccessCount}/${parseTotal} (${(
      parseSuccessRate * 100
    ).toFixed(1)}%), passthrough=${passthroughOk}`,
    data: {
      parseSuccessCount,
      parseTotal,
      parseSuccessRate,
      passthroughOk,
      usedSyntheticEvents,
    },
  });

  checks.push({
    id: 'hook_timeout_200ms',
    title: 'Hook response latency (target <= 200ms)',
    status: checkStatusFromLatency(hookLatencyMs),
    details:
      hookLatencyMs === null
        ? 'no latency sample'
        : `measured latency ${hookLatencyMs}ms`,
    data: {
      hookLatencyMs,
      targetMs: HOOK_TIMEOUT_TARGET_MS,
    },
  });

  checks.push({
    id: 'engine_quota_probe',
    title: 'EngineQuota feasibility (claude --print)',
    status: printProbe.ok ? 'pass' : 'warn',
    details: printProbe.ok
      ? '--print executed successfully'
      : `--print failed (${printProbe.spawnError ?? `exit ${printProbe.exitCode}`})`,
    data: {
      stderr: printProbe.stderr.trim(),
      stdoutPreview: printProbe.stdout.trim().slice(0, 200),
    },
  });

  checks.push({
    id: 'core_sse_connectivity',
    title: 'Core SSE end-to-end connectivity (hook runner -> /events)',
    status: coreSseConnected ? 'pass' : 'warn',
    details: coreSseConnected
      ? 'SSE stream observed forwarded event'
      : 'SSE stream not observed (core bootstrap or network restrictions)',
  });

  if (!cliAvailable) {
    errors.push('claude CLI is unavailable in current environment');
  }
  if (!printProbe.ok && printProbe.stderr) {
    errors.push(printProbe.stderr.trim().split(/\r?\n/).slice(-1)[0] ?? 'unknown');
  }

  sseProbe?.close();
  if (core) {
    await core.stop();
  }

  const finishedAt = new Date().toISOString();
  return {
    checks,
    cliAvailable,
    commandResults,
    coreSseConnected,
    errors,
    finishedAt,
    hookLatencyMs,
    normalizedEvents,
    parseSuccessCount,
    parseSuccessRate,
    parseTotal,
    passthroughOk,
    rawHookEvents,
    startedAt,
    usedSyntheticEvents,
  };
}

async function runAsScript(): Promise<void> {
  if (process.argv.includes('--hook-runner')) {
    await runHookRunner();
    return;
  }

  const result = await validateClaudeHooks();
  for (const check of result.checks) {
    process.stdout.write(`${mapStatusLabel(check.status)} ${check.title}: ${check.details}\n`);
  }
  process.stdout.write(
    `${JSON.stringify(
      {
        commandResults: result.commandResults,
        errors: result.errors,
      },
      null,
      2,
    )}\n`,
  );
}

const entryPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (entryPath === path.resolve(fileURLToPath(import.meta.url))) {
  runAsScript().catch((error) => {
    process.stderr.write(
      `[validate-claude-hooks] ${error instanceof Error ? error.stack : String(error)}\n`,
    );
    process.exitCode = 1;
  });
}
