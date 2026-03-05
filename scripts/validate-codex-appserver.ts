import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';

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

export interface CodexCoverage {
  approval_request: boolean;
  diff: boolean;
  plan_node: boolean;
  token_stream: boolean;
}

export interface CodexValidationResult {
  checks: ValidationCheck[];
  cliAvailable: boolean;
  commandResults: CommandResult[];
  coverage: CodexCoverage;
  errors: string[];
  finishedAt: string;
  observedMethods: string[];
  parsedMessages: Array<Record<string, unknown>>;
  rawLines: string[];
  runtimeProbeSucceeded: boolean;
  schemaFallbackUsed: boolean;
  startedAt: string;
}

interface CommandOptions {
  timeoutMs?: number;
}

interface StdioProbeResult {
  errors: string[];
  parsedMessages: Array<Record<string, unknown>>;
  rawLines: string[];
  success: boolean;
}

const DEFAULT_TIMEOUT_MS = 35_000;

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
    return {
      executable: 'cmd.exe',
      shellArgs: ['/d', '/s', '/c', [command, ...args].map(shellQuoteWindows).join(' ')],
    };
  }

  return {
    executable: 'sh',
    shellArgs: ['-lc', [command, ...args].map(shellQuotePosix).join(' ')],
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

function parseNotificationMethods(
  messages: Array<Record<string, unknown>>,
): string[] {
  const methods = new Set<string>();
  for (const message of messages) {
    const method = asString(message.method);
    if (method) {
      methods.add(method);
    }
  }
  return [...methods].sort();
}

function coverageFromMethods(methods: string[]): CodexCoverage {
  const methodSet = new Set(methods);
  const matches = (...candidates: string[]): boolean =>
    candidates.some((candidate) => methodSet.has(candidate));

  return {
    approval_request: matches(
      'item/commandExecution/requestApproval',
      'item/fileChange/requestApproval',
      'applyPatchApproval',
      'execCommandApproval',
      'item/tool/requestUserInput',
    ),
    diff: matches('turn/diff/updated', 'item/fileChange/outputDelta'),
    plan_node: matches('turn/plan/updated', 'item/plan/delta'),
    token_stream: matches(
      'item/agentMessage/delta',
      'item/reasoning/textDelta',
      'item/reasoning/summaryTextDelta',
    ),
  };
}

function coverageStatus(coverage: CodexCoverage): ValidationStatus {
  const values = Object.values(coverage);
  const trueCount = values.filter(Boolean).length;
  if (trueCount === values.length) {
    return 'pass';
  }
  if (trueCount >= 2) {
    return 'warn';
  }
  return 'fail';
}

async function runCodexStdioProbe(): Promise<StdioProbeResult> {
  const { executable, shellArgs } = buildShellCommand('codex', [
    'app-server',
    '--listen',
    'stdio://',
  ]);

  return new Promise((resolve) => {
    const rawLines: string[] = [];
    const parsedMessages: Array<Record<string, unknown>> = [];
    const errors: string[] = [];
    let buffer = '';
    let settled = false;
    let threadId: string | null = null;

    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(executable, shellArgs, {
        env: process.env,
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
      });
    } catch (error) {
      errors.push(
        `spawn error: ${error instanceof Error ? error.message : String(error)}`,
      );
      resolve({
        errors,
        parsedMessages,
        rawLines,
        success: false,
      });
      return;
    }

    const finish = (success: boolean) => {
      if (settled) {
        return;
      }
      settled = true;
      try {
        child.stdin.end();
      } catch {
        // ignore
      }
      child.kill('SIGTERM');
      resolve({
        errors,
        parsedMessages,
        rawLines,
        success,
      });
    };

    const send = (payload: Record<string, unknown>) => {
      child.stdin.write(`${JSON.stringify(payload)}\n`);
    };

    const timeout = setTimeout(() => {
      errors.push('codex app-server probe timed out');
      finish(parsedMessages.length > 0);
    }, 45_000);

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');

    child.stdout.on('data', (chunk: string) => {
      buffer += chunk;
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) {
          continue;
        }

        rawLines.push(trimmed);
        let parsed: Record<string, unknown> | null = null;
        try {
          parsed = asRecord(JSON.parse(trimmed));
        } catch {
          parsed = null;
        }

        if (!parsed) {
          continue;
        }
        parsedMessages.push(parsed);

        if (parsed.id === '2') {
          const result = asRecord(parsed.result);
          const thread = asRecord(result?.thread);
          const id = asString(thread?.id);
          if (id) {
            threadId = id;
            send({
              id: '3',
              jsonrpc: '2.0',
              method: 'turn/start',
              params: {
                approvalPolicy: 'never',
                input: [{ text: 'Reply with one short sentence.', type: 'text' }],
                threadId,
              },
            });
          }
        }

        if (asString(parsed.method) === 'turn/completed') {
          clearTimeout(timeout);
          finish(true);
        }
      }
    });

    child.stderr.on('data', (chunk: string) => {
      const text = chunk.trim();
      if (text) {
        errors.push(text);
      }
    });

    child.on('error', (error) => {
      clearTimeout(timeout);
      errors.push(`spawn error: ${error.message}`);
      finish(false);
    });

    child.on('close', (exitCode) => {
      clearTimeout(timeout);
      if (!settled) {
        if (exitCode !== 0) {
          errors.push(`codex app-server exited with code ${String(exitCode)}`);
        }
        finish(parsedMessages.length > 0);
      }
    });

    send({
      id: '1',
      jsonrpc: '2.0',
      method: 'initialize',
      params: {
        capabilities: { experimentalApi: true },
        clientInfo: { name: 'do-what-t010-validation', version: '0.1.0' },
      },
    });

    send({
      id: '2',
      jsonrpc: '2.0',
      method: 'thread/start',
      params: {
        approvalPolicy: 'never',
        cwd: process.cwd(),
      },
    });
  });
}

async function readMethodsFromGeneratedSchema(): Promise<string[]> {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'do-what-t010-schema-'));
  const schemaDir = path.join(tempRoot, 'schema');
  await fs.mkdir(schemaDir, { recursive: true });

  const generateResult = await runCommand('codex', [
    'app-server',
    'generate-json-schema',
    '--out',
    schemaDir,
  ]);
  if (!generateResult.ok) {
    return [];
  }

  const files = ['ServerNotification.json', 'ServerRequest.json'].map((file) =>
    path.join(schemaDir, file),
  );
  const methods = new Set<string>();

  for (const file of files) {
    try {
      const raw = await fs.readFile(file, 'utf8');
      const parsed = JSON.parse(raw) as { oneOf?: unknown[] };
      const variants = Array.isArray(parsed.oneOf) ? parsed.oneOf : [];
      for (const variant of variants) {
        const candidate = asRecord(variant);
        const properties = asRecord(candidate?.properties);
        const method = asRecord(properties?.method);
        const enums = Array.isArray(method?.enum) ? method.enum : [];
        for (const value of enums) {
          const text = asString(value);
          if (text) {
            methods.add(text);
          }
        }
      }
    } catch {
      // ignore malformed files
    }
  }

  return [...methods].sort();
}

function statusLabel(status: ValidationStatus): string {
  if (status === 'pass') {
    return '✅';
  }
  if (status === 'warn') {
    return '⚠️';
  }
  return '❌';
}

export async function validateCodexAppServer(): Promise<CodexValidationResult> {
  const startedAt = new Date().toISOString();
  const checks: ValidationCheck[] = [];
  const commandResults: CommandResult[] = [];
  const errors: string[] = [];

  const versionResult = await runCommand('codex', ['--version'], { timeoutMs: 10_000 });
  commandResults.push(versionResult);
  const cliAvailable = versionResult.ok;

  let runtimeProbeSucceeded = false;
  let schemaFallbackUsed = false;
  let parsedMessages: Array<Record<string, unknown>> = [];
  let rawLines: string[] = [];
  let observedMethods: string[] = [];

  if (cliAvailable) {
    const runtimeProbe = await runCodexStdioProbe();
    runtimeProbeSucceeded = runtimeProbe.success;
    parsedMessages = runtimeProbe.parsedMessages;
    rawLines = runtimeProbe.rawLines;
    observedMethods = parseNotificationMethods(parsedMessages);
    errors.push(...runtimeProbe.errors);
  } else {
    errors.push('codex CLI is unavailable in current environment');
  }

  if (!runtimeProbeSucceeded) {
    const fallbackMethods = await readMethodsFromGeneratedSchema();
    if (fallbackMethods.length > 0) {
      schemaFallbackUsed = true;
      observedMethods = fallbackMethods;
    }
  }

  const coverage = coverageFromMethods(observedMethods);
  const coverageState = coverageStatus(coverage);

  checks.push({
    id: 'codex_event_coverage',
    title: 'Codex App Server event coverage',
    status:
      runtimeProbeSucceeded && coverageState === 'pass'
        ? 'pass'
        : coverageState === 'fail'
          ? 'warn'
          : 'warn',
    details: `token_stream=${coverage.token_stream}, plan_node=${coverage.plan_node}, diff=${coverage.diff}, approval_request=${coverage.approval_request} (${runtimeProbeSucceeded ? 'runtime' : schemaFallbackUsed ? 'schema fallback' : 'no probe'})`,
    data: {
      observedMethods,
      runtimeProbeSucceeded,
      schemaFallbackUsed,
    },
  });

  checks.push({
    id: 'codex_bidirectional_jsonl',
    title: 'Codex App Server bidirectional JSONL probe',
    status: runtimeProbeSucceeded ? 'pass' : schemaFallbackUsed ? 'warn' : 'warn',
    details: runtimeProbeSucceeded
      ? `runtime probe received ${parsedMessages.length} JSON-RPC messages`
      : schemaFallbackUsed
        ? 'runtime probe failed, schema generation succeeded'
        : 'runtime and schema fallback both unavailable',
    data: {
      parsedMessageCount: parsedMessages.length,
      rawLineCount: rawLines.length,
    },
  });

  const finishedAt = new Date().toISOString();
  return {
    checks,
    cliAvailable,
    commandResults,
    coverage,
    errors,
    finishedAt,
    observedMethods,
    parsedMessages,
    rawLines,
    runtimeProbeSucceeded,
    schemaFallbackUsed,
    startedAt,
  };
}

async function runAsScript(): Promise<void> {
  const result = await validateCodexAppServer();
  for (const check of result.checks) {
    process.stdout.write(`${statusLabel(check.status)} ${check.title}: ${check.details}\n`);
  }
  process.stdout.write(
    `${JSON.stringify(
      {
        commandResults: result.commandResults,
        errors: result.errors,
        observedMethods: result.observedMethods.slice(0, 20),
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
      `[validate-codex-appserver] ${error instanceof Error ? error.stack : String(error)}\n`,
    );
    process.exitCode = 1;
  });
}
