import EventEmitter from 'node:events';
import type { Writable } from 'node:stream';

import type { JsonlMessage } from './jsonl-reader.js';

interface JsonlWriterEvents {
  error: [error: Error];
  idle: [];
}

export interface JsonlWriterOptions {
  maxQueueSize?: number;
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

export class JsonlWriter extends EventEmitter {
  private readonly maxQueueSize: number;
  private readonly output: Writable;
  private isClosed = false;
  private isDraining = false;
  private drainScheduled = false;
  private readonly queue: string[] = [];

  constructor(output: Writable, options: JsonlWriterOptions = {}) {
    super();
    this.output = output;
    this.maxQueueSize = options.maxQueueSize ?? 100;

    this.output.on('error', (error) => {
      this.emit('error', toError(error));
    });
  }

  close(): void {
    this.isClosed = true;
  }

  getPendingCount(): number {
    return this.queue.length;
  }

  override on<TEvent extends keyof JsonlWriterEvents>(
    event: TEvent,
    listener: (...args: JsonlWriterEvents[TEvent]) => void,
  ): this {
    return super.on(event, listener);
  }

  write(message: JsonlMessage): void {
    if (this.isClosed) {
      console.warn('[codex][jsonl-writer] attempted to write after close');
      return;
    }

    if (this.queue.length >= this.maxQueueSize) {
      this.queue.shift();
      console.warn('[codex][jsonl-writer] queue full, dropping oldest message');
    }

    this.queue.push(`${JSON.stringify(message)}\n`);
    this.scheduleDrain();
  }

  private scheduleDrain(): void {
    if (this.drainScheduled || this.isDraining) {
      return;
    }

    this.drainScheduled = true;
    setImmediate(() => {
      this.drainScheduled = false;
      void this.drainNext();
    });
  }

  private async drainNext(): Promise<void> {
    if (this.isClosed || this.isDraining) {
      return;
    }

    const next = this.queue.shift();
    if (!next) {
      this.emit('idle');
      return;
    }

    this.isDraining = true;

    try {
      await new Promise<void>((resolve, reject) => {
        this.output.write(next, (error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
    } catch (error) {
      this.emit('error', toError(error));
    } finally {
      this.isDraining = false;
    }

    if (this.queue.length > 0) {
      void this.drainNext();
      return;
    }

    this.emit('idle');
  }
}
