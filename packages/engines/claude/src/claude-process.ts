import {
  spawn,
  type ChildProcessWithoutNullStreams,
} from 'node:child_process';

export interface ClaudeProcessOptions {
  args: string[];
  command?: string;
  cwd: string;
  env?: NodeJS.ProcessEnv;
  onExit?: (code: number | null, signal: NodeJS.Signals | null) => void;
  onStderr?: (chunk: string) => void;
  onStdout?: (chunk: string) => void;
}

export class ClaudeProcess {
  private child?: ChildProcessWithoutNullStreams;
  private readonly options: ClaudeProcessOptions;

  constructor(options: ClaudeProcessOptions) {
    this.options = options;
  }

  get pid(): number | undefined {
    return this.child?.pid;
  }

  start(): void {
    if (this.child) {
      throw new Error('Claude process already started');
    }

    const child = spawn(this.options.command ?? 'claude', this.options.args, {
      cwd: this.options.cwd,
      env: this.options.env,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    this.child = child as unknown as ChildProcessWithoutNullStreams;
    this.child.stdout.setEncoding('utf8');
    this.child.stderr.setEncoding('utf8');
    this.child.stdout.on('data', (chunk: string) => {
      this.options.onStdout?.(chunk);
    });
    this.child.stderr.on('data', (chunk: string) => {
      this.options.onStderr?.(chunk);
    });
    this.child.on('close', (code, signal) => {
      this.options.onExit?.(code, signal);
    });
  }

  stop(signal: NodeJS.Signals = 'SIGTERM'): void {
    this.child?.kill(signal);
  }
}

