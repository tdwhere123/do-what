import { spawn, type SpawnOptions } from 'node:child_process';
import EventEmitter from 'node:events';
import type { Readable, Writable } from 'node:stream';

import { HeartbeatMonitor } from './heartbeat-monitor.js';
import { JsonlReader, type JsonlMessage } from './jsonl-reader.js';
import { JsonlWriter } from './jsonl-writer.js';

export interface CodexChildProcess extends EventEmitter {
  pid?: number | undefined;
  stderr: Readable;
  stdin: Writable;
  stdout: Readable;
  kill(signal?: NodeJS.Signals | number): boolean;
}

export type CodexSpawnFactory = (
  command: string,
  args: readonly string[],
  options: SpawnOptions,
) => CodexChildProcess;

export interface CodexProcessOptions {
  args?: readonly string[];
  command?: string;
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  heartbeatTimeoutMs?: number;
  maxRestarts?: number;
  restartDelayMs?: number;
  spawnFactory?: CodexSpawnFactory;
}

interface CodexProcessEvents {
  error: [error: Error];
  exit: [code: number | null, signal: NodeJS.Signals | null];
  message: [message: JsonlMessage];
}

interface PendingTerminalError {
  alreadyEmitted: boolean;
  error: Error;
}

function defaultSpawnFactory(
  command: string,
  args: readonly string[],
  options: SpawnOptions,
): CodexChildProcess {
  return spawn(command, [...args], options) as unknown as CodexChildProcess;
}

function createExitError(
  code: number | null,
  signal: NodeJS.Signals | null,
  pid?: number,
): Error {
  const details =
    code !== null ? `exit code ${code}` : signal ? `signal ${signal}` : 'unknown reason';
  return new Error(`Codex process${pid ? ` ${pid}` : ''} exited unexpectedly (${details})`);
}

function normalizeSignal(signal: string | number | null): NodeJS.Signals | null {
  return typeof signal === 'string' ? (signal as NodeJS.Signals) : null;
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

export class CodexProcess extends EventEmitter {
  private readonly args: readonly string[];
  private readonly command: string;
  private readonly cwd?: string;
  private readonly env?: NodeJS.ProcessEnv;
  private readonly heartbeatTimeoutMs: number;
  private readonly maxRestarts: number;
  private readonly restartDelayMs: number;
  private readonly spawnFactory: CodexSpawnFactory;

  private heartbeat?: HeartbeatMonitor;
  private pendingTerminalError?: PendingTerminalError;
  private reader?: JsonlReader;
  private restartCount = 0;
  private currentChild?: CodexChildProcess;
  private stopping = false;
  private writer?: JsonlWriter;

  constructor(options: CodexProcessOptions = {}) {
    super();
    this.args = options.args ?? ['app-server', '--stdio'];
    this.command = options.command ?? 'codex';
    this.cwd = options.cwd;
    this.env = options.env;
    this.heartbeatTimeoutMs = options.heartbeatTimeoutMs ?? 5 * 60 * 1_000;
    this.maxRestarts = options.maxRestarts ?? 2;
    this.restartDelayMs = options.restartDelayMs ?? 0;
    this.spawnFactory = options.spawnFactory ?? defaultSpawnFactory;
  }

  getRestartCount(): number {
    return this.restartCount;
  }

  isRunning(): boolean {
    return Boolean(this.currentChild);
  }

  override on<TEvent extends keyof CodexProcessEvents>(
    event: TEvent,
    listener: (...args: CodexProcessEvents[TEvent]) => void,
  ): this {
    return super.on(event, listener);
  }

  send(message: JsonlMessage): void {
    if (!this.writer) {
      throw new Error('Codex process is not running');
    }

    this.writer.write(message);
  }

  start(): void {
    if (this.currentChild) {
      return;
    }

    this.stopping = false;
    this.spawnProcess();
  }

  stop(signal: NodeJS.Signals | number = 'SIGTERM'): void {
    this.stopping = true;
    this.heartbeat?.stop();
    this.writer?.close();
    this.currentChild?.kill(signal);
  }

  private attachHeartbeat(child: CodexChildProcess): void {
    this.heartbeat = new HeartbeatMonitor(this.heartbeatTimeoutMs, () => {
      const timeoutError = new Error('Codex heartbeat timed out');
      this.pendingTerminalError = {
        alreadyEmitted: true,
        error: timeoutError,
      };
      this.emit('error', timeoutError);
      child.kill('SIGKILL');
    });
    this.heartbeat.reset();
  }

  private bindReader(reader: JsonlReader): void {
    reader.on('error', (error) => {
      this.emit('error', error);
    });
    reader.on('line', (message) => {
      this.heartbeat?.reset();
      this.emit('message', message);
    });
  }

  private bindWriter(writer: JsonlWriter): void {
    writer.on('error', (error) => {
      this.emit('error', error);
    });
  }

  private cleanupCurrentProcess(): void {
    this.heartbeat?.stop();
    this.heartbeat = undefined;
    this.reader?.close();
    this.reader = undefined;
    this.writer?.close();
    this.writer = undefined;
    this.currentChild = undefined;
  }

  private handleTerminalState(
    code: number | null,
    signal: NodeJS.Signals | null,
    error?: Error,
  ): void {
    const pendingError = this.pendingTerminalError;
    this.pendingTerminalError = undefined;

    const terminalError =
      error ?? pendingError?.error ?? (this.stopping ? undefined : createExitError(code, signal));

    this.cleanupCurrentProcess();

    if (this.stopping) {
      this.emit('exit', code, signal);
      return;
    }

    if (terminalError && !pendingError?.alreadyEmitted) {
      this.emit('error', terminalError);
    }

    if (terminalError && this.restartCount < this.maxRestarts) {
      this.restartCount += 1;
      this.scheduleRestart();
      return;
    }

    this.emit('exit', code, signal);
  }

  private scheduleRestart(): void {
    const restart = () => {
      if (this.stopping || this.currentChild) {
        return;
      }
      this.spawnProcess();
    };

    if (this.restartDelayMs <= 0) {
      setImmediate(restart);
      return;
    }

    setTimeout(restart, this.restartDelayMs);
  }

  private spawnProcess(): void {
    const child = this.spawnFactory(this.command, this.args, {
      cwd: this.cwd,
      env: this.env,
      stdio: 'pipe',
    });

    if (!child.stdin || !child.stdout || !child.stderr) {
      throw new Error('Codex process requires piped stdin/stdout/stderr');
    }

    this.currentChild = child;
    this.attachHeartbeat(child);

    this.reader = new JsonlReader(child.stdout);
    this.writer = new JsonlWriter(child.stdin);
    this.bindReader(this.reader);
    this.bindWriter(this.writer);

    let handled = false;
    const finalize = (code: number | null, signal: NodeJS.Signals | null, childError?: Error) => {
      if (handled) {
        return;
      }
      handled = true;
      this.handleTerminalState(code, signal, childError);
    };

    child.once('error', (childError) => {
      finalize(null, null, toError(childError));
    });
    child.once('exit', (code, signal) => {
      finalize(code, normalizeSignal(signal));
    });
  }
}
