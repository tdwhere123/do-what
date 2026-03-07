import { PassThrough, Writable } from 'node:stream';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  CodexProcess,
  CodexProcessManager,
  HeartbeatMonitor,
  JsonlReader,
  JsonlWriter,
  type CodexChildProcess,
  type CodexSpawnFactory,
} from '../index.js';

function waitForAsyncWork(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

class DeferredWritable extends Writable {
  public readonly writes: string[] = [];
  private readonly callbacks: Array<(error?: Error | null) => void> = [];

  override _write(
    chunk: Buffer | string,
    _encoding: BufferEncoding,
    callback: (error?: Error | null) => void,
  ): void {
    this.writes.push(String(chunk));
    this.callbacks.push(callback);
  }

  flushNext(): void {
    this.callbacks.shift()?.(null);
  }

  flushRemaining(): void {
    while (this.callbacks.length > 0) {
      this.flushNext();
    }
  }
}

class MockCodexChildProcess extends PassThrough implements CodexChildProcess {
  public readonly stderr = new PassThrough();
  public readonly stdin: Writable;
  public readonly stdout = new PassThrough();
  public pid?: number;
  public killedWith?: NodeJS.Signals | number;

  constructor(pid: number, stdin: Writable = new PassThrough()) {
    super();
    this.pid = pid;
    this.stdin = stdin;
  }

  kill(signal: NodeJS.Signals | number = 'SIGTERM'): boolean {
    this.killedWith = signal;
    this.emit('exit', signal === 'SIGTERM' ? 0 : 1, signal);
    return true;
  }
}

function createSpawnFactory(children: readonly MockCodexChildProcess[]): CodexSpawnFactory {
  let index = 0;
  return () => {
    const child = children[index];
    if (!child) {
      throw new Error('spawn called more times than expected');
    }
    index += 1;
    return child;
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('codex process transport', () => {
  it('parses JSONL messages and ignores invalid lines without crashing the process', async () => {
    const input = new PassThrough();
    const reader = new JsonlReader(input);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const messages: Array<Record<string, unknown>> = [];

    reader.on('line', (message) => {
      messages.push(message);
    });

    input.write('{"type":"token_stream","text":"hello"}\n');
    input.write('not-json\n');
    input.end();

    await waitForAsyncWork();

    expect(messages).toEqual([{ text: 'hello', type: 'token_stream' }]);
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it('drops the oldest queued JSONL entries when the process writer queue is full', async () => {
    const output = new DeferredWritable();
    const writer = new JsonlWriter(output, { maxQueueSize: 2 });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    writer.write({ order: 1 });
    writer.write({ order: 2 });
    writer.write({ order: 3 });
    writer.write({ order: 4 });

    await waitForAsyncWork();
    output.flushRemaining();
    await waitForAsyncWork();

    expect(output.writes).toEqual(['{"order":3}\n', '{"order":4}\n']);
    expect(warnSpy).toHaveBeenCalledTimes(2);
  });

  it('restarts a crashed Codex process and continues receiving messages', async () => {
    const first = new MockCodexChildProcess(101);
    const second = new MockCodexChildProcess(202);
    const process = new CodexProcess({
      maxRestarts: 2,
      spawnFactory: createSpawnFactory([first, second]),
    });
    const messages: Array<Record<string, unknown>> = [];

    process.on('message', (message) => {
      messages.push(message);
    });
    process.on('error', () => {});

    process.start();
    first.emit('exit', 1, null);
    await waitForAsyncWork();

    second.stdout.write('{"type":"plan_node","nodeId":"n1"}\n');
    await waitForAsyncWork();

    expect(process.getRestartCount()).toBe(1);
    expect(messages).toEqual([{ nodeId: 'n1', type: 'plan_node' }]);
  });

  it('emits an error and kills a hung Codex process when heartbeat resets stop', async () => {
    vi.useFakeTimers();

    const child = new MockCodexChildProcess(303);
    const process = new CodexProcess({
      heartbeatTimeoutMs: 25,
      maxRestarts: 0,
      spawnFactory: createSpawnFactory([child]),
    });
    const errors: Error[] = [];

    process.on('error', (error) => {
      errors.push(error);
    });

    process.start();
    await vi.advanceTimersByTimeAsync(30);

    expect(child.killedWith).toBe('SIGKILL');
    expect(errors.at(0)?.message).toContain('heartbeat timed out');
  });

  it('tracks run-scoped processes in the manager and removes them after exit', async () => {
    const capturedInput = new PassThrough();
    const manager = new CodexProcessManager({
      spawnFactory: createSpawnFactory([new MockCodexChildProcess(404, capturedInput)]),
    });
    let sent = '';
    capturedInput.on('data', (chunk) => {
      sent += String(chunk);
    });

    manager.spawn('run-1');
    manager.send('run-1', { type: 'user_input', content: 'hello' });
    await waitForAsyncWork();

    expect(manager.has('run-1')).toBe(true);
    expect(sent).toContain('"type":"user_input"');

    manager.kill('run-1');
    await waitForAsyncWork();

    expect(manager.has('run-1')).toBe(false);
    expect(manager.size).toBe(0);
  });

  it('resets and cancels the standalone process heartbeat monitor', async () => {
    vi.useFakeTimers();

    const onTimeout = vi.fn();
    const monitor = new HeartbeatMonitor(20, onTimeout);

    monitor.reset();
    await vi.advanceTimersByTimeAsync(10);
    monitor.reset();
    await vi.advanceTimersByTimeAsync(15);
    expect(onTimeout).not.toHaveBeenCalled();

    monitor.stop();
    await vi.advanceTimersByTimeAsync(20);
    expect(onTimeout).not.toHaveBeenCalled();
  });
});
