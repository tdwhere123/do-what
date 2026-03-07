import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { BaselineTracker } from './baseline-tracker.js';

const DEFAULT_TIMEOUT_MS = 60_000;

export interface CommandExecutionOptions {
  cwd: string;
  timeoutMs: number;
}

export interface CommandExecutionResult {
  exitCode: number;
  stderr: string;
  stdout: string;
}

export interface GateCommandResult {
  command: string;
  diagnosticsCount: number;
  exitCode: number;
  name: string;
  reason?: string;
  status: 'failed' | 'passed' | 'skipped';
  stderr: string;
  stdout: string;
}

export interface FastGateInput {
  touchedPaths: readonly string[];
  workspaceId: string;
  workspacePath: string;
}

export interface FastGateResult {
  afterErrorCount: number;
  baselineErrorCount: number;
  commands: readonly GateCommandResult[];
  createdBaseline: boolean;
  delta: number;
  newDiagnostics: readonly string[];
  passed: boolean;
}

export type CommandRunner = (
  command: string,
  args: readonly string[],
  options: CommandExecutionOptions,
) => Promise<CommandExecutionResult>;

export interface FastGateOptions {
  baselineTracker: BaselineTracker;
  commandRunner?: CommandRunner;
  fileExists?: (path: string) => boolean;
  timeoutMs?: number;
}

function resolvePnpmCommand(): string {
  return process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
}

function normalizeCommand(command: string): string {
  if (process.platform !== 'win32' || /\.(cmd|exe|bat)$/i.test(command)) {
    return command;
  }
  return `${command}.cmd`;
}

function detectPackageFilter(touchedPath: string): string | null {
  const parts = touchedPath.replace(/\\/g, '/').split('/');
  if (parts[0] !== 'packages') {
    return null;
  }
  if (parts[1] === 'engines' && parts.length >= 3) {
    return `@do-what/${parts[2]}`;
  }
  if (parts.length >= 2) {
    return `@do-what/${parts[1]}`;
  }
  return null;
}

function collectPackageFilters(touchedPaths: readonly string[]): string[] {
  const filters = new Set<string>();
  for (const touchedPath of touchedPaths) {
    const filter = detectPackageFilter(touchedPath);
    if (filter) {
      filters.add(filter);
    }
  }
  return [...filters];
}

function shouldRunTests(touchedPaths: readonly string[]): boolean {
  return touchedPaths.some((touchedPath) =>
    /(^|\/)__tests__\/|\.test\.[^/]+$|\.spec\.[^/]+$/i.test(
      touchedPath.replace(/\\/g, '/'),
    ),
  );
}

function hasEslintConfig(workspacePath: string, fileExists: (path: string) => boolean): boolean {
  for (const candidate of [
    'eslint.config.js',
    'eslint.config.mjs',
    'eslint.config.cjs',
    '.eslintrc',
    '.eslintrc.js',
    '.eslintrc.cjs',
    '.eslintrc.json',
  ]) {
    if (fileExists(`${workspacePath}/${candidate}`)) {
      return true;
    }
  }
  return false;
}

function countDiagnostics(output: string, exitCode: number): number {
  if (exitCode === 0) {
    return 0;
  }

  const diagnosticLines = output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /(error TS\d+|\berror\b|\bFAIL(?:ED)?\b|×|\u2716)/i.test(line));

  return diagnosticLines.length > 0 ? diagnosticLines.length : 1;
}

function extractDiagnostics(output: string): string[] {
  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /(error TS\d+|\berror\b|\bFAIL(?:ED)?\b|×|\u2716)/i.test(line))
    .slice(0, 20);
}

async function defaultCommandRunner(
  command: string,
  args: readonly string[],
  options: CommandExecutionOptions,
): Promise<CommandExecutionResult> {
  const resolvedCommand = normalizeCommand(command);

  return new Promise<CommandExecutionResult>((resolve, reject) => {
    const child = spawn(resolvedCommand, [...args], {
      cwd: options.cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    let settled = false;

    const finish = (error?: Error, result?: CommandExecutionResult) => {
      if (settled) {
        return;
      }
      settled = true;
      if (timeout) {
        clearTimeout(timeout);
      }
      if (error) {
        reject(error);
        return;
      }
      resolve(result as CommandExecutionResult);
    };

    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      stdout += chunk;
    });

    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk: string) => {
      stderr += chunk;
    });

    child.on('error', (error) => {
      finish(error);
    });

    child.on('close', (code) => {
      finish(undefined, {
        exitCode: code ?? 1,
        stderr,
        stdout,
      });
    });

    const timeout = setTimeout(() => {
      child.kill();
      finish(undefined, {
        exitCode: 124,
        stderr: `${stderr}\ncommand timed out after ${options.timeoutMs}ms`.trim(),
        stdout,
      });
    }, options.timeoutMs);
  });
}

export class FastGate {
  private readonly baselineTracker: BaselineTracker;
  private readonly commandRunner: CommandRunner;
  private readonly fileExists: (path: string) => boolean;
  private readonly timeoutMs: number;

  constructor(options: FastGateOptions) {
    this.baselineTracker = options.baselineTracker;
    this.commandRunner = options.commandRunner ?? defaultCommandRunner;
    this.fileExists = options.fileExists ?? fs.existsSync;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  async run(input: FastGateInput): Promise<FastGateResult> {
    const pnpmCommand = resolvePnpmCommand();
    const packageFilters = collectPackageFilters(input.touchedPaths);
    const commands: GateCommandResult[] = [];

    if (packageFilters.length === 0) {
      commands.push({
        command: '',
        diagnosticsCount: 0,
        exitCode: 0,
        name: 'tsc',
        reason: 'no package scope detected from touched paths',
        status: 'skipped',
        stderr: '',
        stdout: '',
      });
    } else {
      for (const filter of packageFilters) {
        commands.push(
          await this.executeCommand({
            args: ['--filter', filter, 'exec', 'tsc', '--noEmit'],
            command: pnpmCommand,
            cwd: input.workspacePath,
            name: `tsc:${filter}`,
            optional: false,
          }),
        );
      }
    }

    if (
      input.touchedPaths.length === 0
      || !hasEslintConfig(input.workspacePath, this.fileExists)
    ) {
      commands.push({
        command: '',
        diagnosticsCount: 0,
        exitCode: 0,
        name: 'eslint',
        reason: 'no eslint config or touched paths',
        status: 'skipped',
        stderr: '',
        stdout: '',
      });
    } else {
      commands.push(
        await this.executeCommand({
          args: ['exec', 'eslint', ...input.touchedPaths, '--max-warnings', '0'],
          command: pnpmCommand,
          cwd: input.workspacePath,
          name: 'eslint',
          optional: true,
        }),
      );
    }

    if (!shouldRunTests(input.touchedPaths) || packageFilters.length === 0) {
      commands.push({
        command: '',
        diagnosticsCount: 0,
        exitCode: 0,
        name: 'tests',
        reason: 'no touched test files',
        status: 'skipped',
        stderr: '',
        stdout: '',
      });
    } else {
      for (const filter of packageFilters) {
        commands.push(
          await this.executeCommand({
            args: ['--filter', filter, 'test'],
            command: pnpmCommand,
            cwd: input.workspacePath,
            name: `tests:${filter}`,
            optional: true,
          }),
        );
      }
    }

    const afterErrorCount = commands.reduce(
      (sum, commandResult) => sum + commandResult.diagnosticsCount,
      0,
    );
    const evaluation = this.baselineTracker.evaluate(input.workspaceId, afterErrorCount);
    if (evaluation.passed) {
      await this.baselineTracker.update(input.workspaceId, afterErrorCount);
    }

    return {
      afterErrorCount,
      baselineErrorCount: evaluation.baselineErrorCount,
      commands,
      createdBaseline: evaluation.createdBaseline,
      delta: evaluation.delta,
      newDiagnostics: commands.flatMap((commandResult) =>
        commandResult.status === 'failed'
          ? extractDiagnostics([commandResult.stdout, commandResult.stderr].join('\n'))
          : [],
      ),
      passed: evaluation.passed,
    };
  }

  private async executeCommand(input: {
    args: readonly string[];
    command: string;
    cwd: string;
    name: string;
    optional: boolean;
  }): Promise<GateCommandResult> {
    try {
      const result = await this.commandRunner(input.command, input.args, {
        cwd: input.cwd,
        timeoutMs: this.timeoutMs,
      });
      const combinedOutput = [result.stdout, result.stderr].join('\n');
      const diagnosticsCount = countDiagnostics(combinedOutput, result.exitCode);

      return {
        command: [input.command, ...input.args].join(' '),
        diagnosticsCount,
        exitCode: result.exitCode,
        name: input.name,
        status: result.exitCode === 0 ? 'passed' : 'failed',
        stderr: result.stderr,
        stdout: result.stdout,
      };
    } catch (error) {
      if (input.optional) {
        return {
          command: [input.command, ...input.args].join(' '),
          diagnosticsCount: 0,
          exitCode: 0,
          name: input.name,
          reason: error instanceof Error ? error.message : String(error),
          status: 'skipped',
          stderr: '',
          stdout: '',
        };
      }

      const message = error instanceof Error ? error.message : String(error);
      return {
        command: [input.command, ...input.args].join(' '),
        diagnosticsCount: 1,
        exitCode: 1,
        name: input.name,
        status: 'failed',
        stderr: message,
        stdout: '',
      };
    }
  }
}
