import type {
  PointerRelocationInput,
  PointerRelocationResult,
  PointerRelocator,
} from './pointer-relocator.js';

const DEFAULT_MAX_ATTEMPTS_PER_MINUTE = 5;

export interface HealingQueueOptions {
  maxAttemptsPerMinute?: number;
  now?: () => number;
  relocator: PointerRelocator;
  sleep?: (ms: number) => Promise<void>;
}

export class HealingQueue {
  private completed = 0;
  private failed = 0;
  private readonly issuedAt: number[] = [];
  private readonly maxAttemptsPerMinute: number;
  private readonly now: () => number;
  private queue = Promise.resolve();
  private queued = 0;
  private readonly relocator: PointerRelocator;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(options: HealingQueueOptions) {
    this.maxAttemptsPerMinute =
      options.maxAttemptsPerMinute ?? DEFAULT_MAX_ATTEMPTS_PER_MINUTE;
    this.now = options.now ?? Date.now;
    this.relocator = options.relocator;
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => {
      setTimeout(resolve, ms);
    }));
  }

  enqueue(input: PointerRelocationInput): Promise<PointerRelocationResult> {
    this.queued += 1;
    const scheduled = this.queue.then(async () => {
      await new Promise<void>((resolve) => {
        setImmediate(resolve);
      });
      await this.applyRateLimit();
      const result = await this.relocator.relocate(input);
      this.queued -= 1;
      if (result.found || result.relocationStatus === 'semantic_candidate') {
        this.completed += 1;
      } else {
        this.failed += 1;
      }
      return result;
    });

    this.queue = scheduled.then(() => undefined, () => undefined);
    return scheduled;
  }

  stats(): { completed: number; failed: number; queued: number } {
    return {
      completed: this.completed,
      failed: this.failed,
      queued: this.queued,
    };
  }

  private async applyRateLimit(): Promise<void> {
    const now = this.now();
    while (this.issuedAt.length > 0 && now - this.issuedAt[0]! >= 60_000) {
      this.issuedAt.shift();
    }

    if (this.issuedAt.length >= this.maxAttemptsPerMinute) {
      const waitMs = 60_000 - (now - this.issuedAt[0]!);
      await this.sleep(Math.max(1, waitMs));
    }

    this.issuedAt.push(this.now());
  }
}
