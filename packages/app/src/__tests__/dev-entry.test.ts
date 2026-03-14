// @vitest-environment node

import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import {
  resolveCoreBaseUrl,
  runDevEntry,
} from '../../../../scripts/dev.mjs';

class FakeChildProcess extends EventEmitter {
  exitCode: number | null = null;
  killed = false;
  readonly killSignals: string[] = [];

  constructor() {
    super();
    this.on('error', () => {});
  }

  complete(code = 0, signal: string | null = null): void {
    if (this.exitCode !== null) {
      return;
    }

    this.exitCode = code;
    this.emit('exit', code, signal);
  }

  kill(signal = 'SIGTERM'): boolean {
    this.killed = true;
    this.killSignals.push(signal);
    this.complete(signal === 'SIGKILL' ? 1 : 0, signal);
    return true;
  }

  fail(error: Error): void {
    this.emit('error', error);
  }
}

function createLogger() {
  return {
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };
}

function getSpawnArgs(
  spawnProcess: ReturnType<typeof vi.fn>,
  callIndex: number,
): string[] | undefined {
  const calls = spawnProcess.mock.calls as unknown as [string, string[], unknown][];
  return calls[callIndex]?.[1];
}

describe('dev entry orchestration', () => {
  it('prefers VITE_CORE_BASE_URL and otherwise follows DOWHAT_PORT', () => {
    expect(resolveCoreBaseUrl({ VITE_CORE_BASE_URL: 'http://127.0.0.1:4999/' })).toBe(
      'http://127.0.0.1:4999',
    );
    expect(resolveCoreBaseUrl({ DOWHAT_PORT: '4123' })).toBe('http://127.0.0.1:4123');
    expect(resolveCoreBaseUrl({})).toBe('http://127.0.0.1:3847');
  });

  it('reuses an already healthy Core and launches only the App', async () => {
    const appChild = new FakeChildProcess();
    const spawnProcess = vi.fn(() => {
      queueMicrotask(() => {
        appChild.complete(0);
      });
      return appChild;
    });
    const logger = createLogger();

    const exitCode = await runDevEntry({
      fetchImpl: vi.fn(async () => new Response(null, { status: 200 })),
      logger,
      sleep: async () => {},
      spawnProcess,
    });

    expect(exitCode).toBe(0);
    expect(spawnProcess).toHaveBeenCalledTimes(1);
    expect(getSpawnArgs(spawnProcess, 0)).toEqual([
      '--filter',
      '@do-what/app',
      'start',
    ]);
    expect(logger.log).toHaveBeenCalledWith('[dev] Starting App...');
  });

  it('starts Core, waits for health, then launches App and cleans up started Core', async () => {
    const coreChild = new FakeChildProcess();
    const appChild = new FakeChildProcess();
    const spawnProcess = vi
      .fn()
      .mockImplementationOnce(() => coreChild)
      .mockImplementationOnce(() => {
        queueMicrotask(() => {
          appChild.complete(0);
        });
        return appChild;
      });
    let now = 0;
    let healthChecks = 0;

    const exitCode = await runDevEntry({
      fetchImpl: vi.fn(async () => {
        healthChecks += 1;
        return new Response(null, { status: healthChecks >= 3 ? 200 : 503 });
      }),
      now: () => now,
      sleep: async (delayMs: number) => {
        now += delayMs;
      },
      spawnProcess,
    });

    expect(exitCode).toBe(0);
    expect(spawnProcess).toHaveBeenCalledTimes(2);
    expect(getSpawnArgs(spawnProcess, 0)).toEqual([
      '--filter',
      '@do-what/core',
      'start',
    ]);
    expect(getSpawnArgs(spawnProcess, 1)).toEqual([
      '--filter',
      '@do-what/app',
      'start',
    ]);
    expect(coreChild.killed).toBe(true);
  });

  it('fails fast when Core never becomes healthy and does not start App', async () => {
    const coreChild = new FakeChildProcess();
    const logger = createLogger();
    let now = 0;

    const exitCode = await runDevEntry({
      fetchImpl: vi.fn(async () => new Response(null, { status: 503 })),
      logger,
      now: () => now,
      sleep: async (delayMs: number) => {
        await Promise.resolve();
        now += delayMs;
      },
      spawnProcess: vi.fn(() => coreChild),
      timeoutMs: 1_000,
    });

    expect(exitCode).toBe(1);
    expect(logger.error).toHaveBeenCalledWith(
      '[dev] Timed out waiting for Core health at http://127.0.0.1:3847/health after 1s.',
    );
    expect(coreChild.killed).toBe(true);
  });

  it('fails fast when Core exits before becoming healthy', async () => {
    const coreChild = new FakeChildProcess();
    const logger = createLogger();
    let now = 0;
    let coreSpawned = false;

    const exitCode = await runDevEntry({
      fetchImpl: vi.fn(async () => {
        if (coreSpawned && now === 0) {
          coreChild.complete(1);
        }
        return new Response(null, { status: 503 });
      }),
      logger,
      now: () => now,
      sleep: async (delayMs: number) => {
        await Promise.resolve();
        now += delayMs;
      },
      spawnProcess: vi.fn(() => {
        coreSpawned = true;
        return coreChild;
      }),
      timeoutMs: 1_000,
    });

    expect(exitCode).toBe(1);
    expect(logger.error).toHaveBeenCalledWith(
      '[dev] Core exited before becoming healthy (code 1).',
    );
  });

  it('fails fast when Core process errors before becoming healthy', async () => {
    const coreChild = new FakeChildProcess();
    const logger = createLogger();
    let now = 0;
    let coreSpawned = false;

    const exitCode = await runDevEntry({
      fetchImpl: vi.fn(async () => {
        if (coreSpawned && now === 0) {
          coreChild.fail(new Error('spawn EPERM'));
        }
        return new Response(null, { status: 503 });
      }),
      logger,
      now: () => now,
      sleep: async (delayMs: number) => {
        await Promise.resolve();
        now += delayMs;
      },
      spawnProcess: vi.fn(() => {
        coreSpawned = true;
        return coreChild;
      }),
      timeoutMs: 1_000,
    });

    expect(exitCode).toBe(1);
    expect(logger.error).toHaveBeenCalledWith(
      '[dev] Core failed to start (spawn EPERM).',
    );
  });
});
