import { spawn } from 'node:child_process';

export interface RunProcessOptions {
  args: readonly string[];
  command: string;
  cwd?: string;
}

export interface RunProcessResult {
  code: number;
  stderr: string;
  stdout: string;
}

export async function runProcess(
  options: RunProcessOptions,
): Promise<RunProcessResult> {
  return new Promise<RunProcessResult>((resolve, reject) => {
    const child = spawn(options.command, [...options.args], {
      cwd: options.cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', reject);
    child.on('close', (code) => {
      resolve({
        code: code ?? 1,
        stderr: stderr.trim(),
        stdout: stdout.trim(),
      });
    });
  });
}
