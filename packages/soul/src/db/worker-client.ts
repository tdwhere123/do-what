import { randomUUID } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import { Worker } from 'node:worker_threads';

export interface SoulDbWriteRequest {
  params: unknown[];
  sql: string;
}

interface WorkerResultMessage {
  error?: string;
  id: string;
  ok: boolean;
  type: 'result';
}

interface PendingRequest {
  reject: (reason?: unknown) => void;
  resolve: () => void;
}

const MAX_RESTART_ATTEMPTS = 3;
const CLOSE_DRAIN_TIMEOUT_MS = 250;
const CLOSE_DRAIN_INTERVAL_MS = 10;

export class SoulWorkerClient {
  private closed = false;
  private readonly dbPath: string;
  private pending = new Map<string, PendingRequest>();
  private restartAttempts = 0;
  private worker: Worker;

  constructor(dbPath: string) {
    this.dbPath = dbPath;
    this.worker = this.spawnWorker();
  }

  async close(): Promise<void> {
    if (this.closed) {
      return;
    }

    this.closed = true;
    await this.waitForPendingDrain();
    if (this.pending.size > 0) {
      this.failAllPending(new Error('soul worker client closed'));
    }
    await this.worker.terminate();
  }

  async write(request: SoulDbWriteRequest): Promise<void> {
    if (this.closed) {
      throw new Error('soul worker client is closed');
    }

    const id = randomUUID();
    const operation = new Promise<void>((resolve, reject) => {
      this.pending.set(id, { reject, resolve });
    });

    this.worker.postMessage({
      id,
      params: request.params,
      sql: request.sql,
      type: 'write',
    });

    return operation;
  }

  private spawnWorker(): Worker {
    const worker = new Worker(new URL('./soul-worker.js', import.meta.url), {
      workerData: { dbPath: this.dbPath },
    });

    worker.on('message', (message: WorkerResultMessage) => {
      if (message.type !== 'result') {
        return;
      }

      const pendingRequest = this.pending.get(message.id);
      if (!pendingRequest) {
        return;
      }

      this.pending.delete(message.id);
      if (message.ok) {
        this.restartAttempts = 0;
        pendingRequest.resolve();
        return;
      }

      pendingRequest.reject(new Error(message.error ?? 'soul database write failed'));
    });

    worker.on('error', (error) => {
      this.tryRestart(error);
    });

    worker.on('exit', (code) => {
      if (code !== 0) {
        this.tryRestart(new Error(`soul database worker exited with code ${code}`));
      }
    });

    return worker;
  }

  private tryRestart(error: Error): void {
    if (this.closed) {
      return;
    }

    if (this.restartAttempts >= MAX_RESTART_ATTEMPTS) {
      this.failAllPending(
        new Error(`soul database worker restart limit reached: ${error.message}`),
      );
      return;
    }

    this.failAllPending(error);
    this.restartAttempts += 1;
    this.worker = this.spawnWorker();
  }

  private failAllPending(error: Error): void {
    for (const pending of this.pending.values()) {
      pending.reject(error);
    }
    this.pending.clear();
  }

  private async waitForPendingDrain(): Promise<void> {
    const deadline = Date.now() + CLOSE_DRAIN_TIMEOUT_MS;
    while (this.pending.size > 0 && Date.now() < deadline) {
      await sleep(CLOSE_DRAIN_INTERVAL_MS);
    }
  }
}
