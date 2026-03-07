import type { RunLifecycleEvent } from '@do-what/protocol';
import type { MemoryCompilerCompileInput } from './memory-compiler.js';

const DEFAULT_DELAY_MS = 5_000;
const DEFAULT_MIN_INTERVAL_MS = 10 * 60 * 1_000;
const METADATA_RETRY_DELAY_MS = 100;
const METADATA_RETRY_LIMIT = 5;

export interface CompletedRunContext {
  commitSha?: string;
  diff: string;
  projectId: string;
  runId: string;
  summary?: string;
}

export interface CompilerTriggerOptions {
  delayMs?: number;
  eventSubscriber: {
    off: (eventType: string, listener: (event: unknown) => void) => void;
    on: (eventType: string, listener: (event: unknown) => void) => void;
  };
  loadCompletedRun: (runId: string) => Promise<CompletedRunContext | null>;
  memoryCompiler: {
    compile: (input: MemoryCompilerCompileInput) => Promise<unknown>;
  };
  minIntervalMs?: number;
  now?: () => number;
}

export class CompilerTrigger {
  private closed = false;
  private readonly delayMs: number;
  private readonly eventSubscriber: CompilerTriggerOptions['eventSubscriber'];
  private readonly inFlight = new Set<Promise<void>>();
  private readonly lastCompiledAt = new Map<string, number>();
  private readonly loadCompletedRun: CompilerTriggerOptions['loadCompletedRun'];
  private readonly memoryCompiler: CompilerTriggerOptions['memoryCompiler'];
  private readonly minIntervalMs: number;
  private readonly now: () => number;
  private readonly pendingTimers = new Map<string, NodeJS.Timeout>();

  constructor(options: CompilerTriggerOptions) {
    this.delayMs = options.delayMs ?? DEFAULT_DELAY_MS;
    this.eventSubscriber = options.eventSubscriber;
    this.loadCompletedRun = options.loadCompletedRun;
    this.memoryCompiler = options.memoryCompiler;
    this.minIntervalMs = options.minIntervalMs ?? DEFAULT_MIN_INTERVAL_MS;
    this.now = options.now ?? Date.now;
    this.eventSubscriber.on('status:completed', this.handleCompleted);
  }

  async close(): Promise<void> {
    this.closed = true;
    this.eventSubscriber.off('status:completed', this.handleCompleted);
    for (const timer of this.pendingTimers.values()) {
      clearTimeout(timer);
    }
    this.pendingTimers.clear();
    await Promise.allSettled([...this.inFlight]);
  }

  private readonly handleCompleted = (event: unknown): void => {
    if (this.closed) {
      return;
    }

    const payload = event as Partial<RunLifecycleEvent>;
    if (typeof payload.runId !== 'string') {
      return;
    }

    this.schedule(payload.runId, this.delayMs, 0);
  };

  private async fire(runId: string, attempt: number): Promise<void> {
    if (this.closed) {
      return;
    }

    const context = await this.loadCompletedRun(runId);
    if (this.closed) {
      return;
    }

    if (!context || context.diff.trim().length === 0) {
      if (!this.closed && attempt < METADATA_RETRY_LIMIT) {
        this.schedule(runId, METADATA_RETRY_DELAY_MS, attempt + 1);
      }
      return;
    }

    const lastCompiledAt = this.lastCompiledAt.get(context.projectId) ?? 0;
    if (this.now() - lastCompiledAt < this.minIntervalMs) {
      return;
    }

    this.lastCompiledAt.set(context.projectId, this.now());
    await this.memoryCompiler.compile({
      commitSha: context.commitSha,
      diff: context.diff,
      projectId: context.projectId,
      summary: context.summary,
    });
  }

  private schedule(runId: string, delayMs: number, attempt: number): void {
    if (this.closed) {
      return;
    }

    const existing = this.pendingTimers.get(runId);
    if (existing) {
      clearTimeout(existing);
    }

    const timer = setTimeout(() => {
      this.pendingTimers.delete(runId);
      const task = this.fire(runId, attempt);
      this.inFlight.add(task);
      void task.finally(() => {
        this.inFlight.delete(task);
      });
    }, delayMs);
    this.pendingTimers.set(runId, timer);
  }
}
