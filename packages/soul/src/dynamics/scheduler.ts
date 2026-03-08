import { TABLE_MEMORY_CUES, type CueRow } from '../db/schema.js';
import type { SoulStateStore } from '../db/soul-state-store.js';
import type { SoulWorkerClient } from '../db/worker-client.js';
import { computeRetention, shouldPrune } from './retention.js';

const DEFAULT_INTERVAL_MS = 24 * 60 * 60 * 1000;

export interface RetentionSchedulerOptions {
  intervalMs?: number;
  stateStore: SoulStateStore;
  writer: SoulWorkerClient;
}

export class RetentionScheduler {
  private readonly intervalMs: number;
  private intervalRef?: NodeJS.Timeout;
  private readonly stateStore: SoulStateStore;
  private readonly writer: SoulWorkerClient;

  constructor(options: RetentionSchedulerOptions) {
    this.intervalMs = options.intervalMs ?? DEFAULT_INTERVAL_MS;
    this.stateStore = options.stateStore;
    this.writer = options.writer;
  }

  start(): void {
    if (this.intervalRef) {
      return;
    }

    this.intervalRef = setInterval(() => {
      void this.sweep();
    }, this.intervalMs);
    this.intervalRef.unref?.();
  }

  stop(): void {
    if (!this.intervalRef) {
      return;
    }
    clearInterval(this.intervalRef);
    this.intervalRef = undefined;
  }

  async sweep(now = new Date()): Promise<void> {
    const cues = this.stateStore.read(
      (db) =>
        db
          .prepare(`SELECT * FROM ${TABLE_MEMORY_CUES}`)
          .all() as CueRow[],
      [] as CueRow[],
    );
    const nowIso = now.toISOString();
    for (const cue of cues) {
      const retention = computeRetention(cue, now);
      const pruned = shouldPrune(cue, now) ? 1 : cue.pruned ?? 0;
      await this.writer.write({
        params: [retention, pruned, nowIso, cue.cue_id],
        sql: `UPDATE ${TABLE_MEMORY_CUES}
              SET retention_score = ?,
                  pruned = ?,
                  updated_at = ?
              WHERE cue_id = ?`,
      });
    }
  }
}
