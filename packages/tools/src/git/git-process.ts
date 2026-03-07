import { spawn } from 'node:child_process';

export interface GitCommandOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  stdin?: string;
  timeoutMs?: number;
}

export interface GitCommandResult {
  exitCode: number;
  stderr: string;
  stdout: string;
}

export class GitCommandError extends Error {
  readonly args: readonly string[];
  readonly cwd?: string;
  readonly exitCode: number;
  readonly stderr: string;
  readonly stdout: string;

  constructor(
    message: string,
    options: {
      args: readonly string[];
      cwd?: string;
      exitCode: number;
      stderr: string;
      stdout: string;
    },
  ) {
    super(message);
    this.name = 'GitCommandError';
    this.args = options.args;
    this.cwd = options.cwd;
    this.exitCode = options.exitCode;
    this.stderr = options.stderr;
    this.stdout = options.stdout;
  }
}

export type GitRunner = (
  args: readonly string[],
  options?: GitCommandOptions,
) => Promise<GitCommandResult>;

export const DEFAULT_GIT_TIMEOUT_MS = 60_000;

export const runGit: GitRunner = async (
  args,
  options = {},
): Promise<GitCommandResult> => {
  const command = process.platform === 'win32' ? 'git.exe' : 'git';

  return new Promise<GitCommandResult>((resolve, reject) => {
    const child = spawn(command, [...args], {
      cwd: options.cwd,
      env: options.env,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    let settled = false;

    const finish = (error?: Error, result?: GitCommandResult) => {
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
      resolve(result as GitCommandResult);
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
      const exitCode = code ?? 1;
      const result = { exitCode, stderr, stdout };
      if (exitCode === 0) {
        finish(undefined, result);
        return;
      }

      finish(
        new GitCommandError(
          `git ${args.join(' ')} failed with exit code ${exitCode}`,
          {
            args,
            cwd: options.cwd,
            exitCode,
            stderr,
            stdout,
          },
        ),
      );
    });

    const timeoutMs = options.timeoutMs ?? DEFAULT_GIT_TIMEOUT_MS;
    const timeout = setTimeout(() => {
      child.kill();
      finish(
        new GitCommandError(
          `git ${args.join(' ')} timed out after ${timeoutMs}ms`,
          {
            args,
            cwd: options.cwd,
            exitCode: 124,
            stderr,
            stdout,
          },
        ),
      );
    }, timeoutMs);

    if (options.stdin !== undefined) {
      child.stdin.end(options.stdin, 'utf8');
      return;
    }

    child.stdin.end();
  });
};
