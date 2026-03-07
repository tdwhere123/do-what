import {
  TABLE_SOUL_BUDGETS,
  type SoulBudgetRow,
} from '../db/schema.js';
import type { SoulStateStore } from '../db/soul-state-store.js';
import type { SoulWorkerClient } from '../db/worker-client.js';
import type { CostEstimate } from './provider.js';

const DEFAULT_MAX_DOLLARS = 1;
const DEFAULT_MAX_TOKENS = 20_000;

export interface DailyBudgetLimits {
  maxDollars?: number;
  maxTokens?: number;
}

export interface DailyBudgetUsage {
  date: string;
  dollarsUsed: number;
  tokensUsed: number;
}

export interface DailyBudgetOptions {
  limits?: DailyBudgetLimits;
  now?: () => Date;
  stateStore: SoulStateStore;
  writer: SoulWorkerClient;
}

export class DailyBudget {
  private readonly limits: Required<DailyBudgetLimits>;
  private readonly now: () => Date;
  private readonly stateStore: SoulStateStore;
  private readonly writer: SoulWorkerClient;

  constructor(options: DailyBudgetOptions) {
    this.limits = {
      maxDollars: options.limits?.maxDollars ?? DEFAULT_MAX_DOLLARS,
      maxTokens: options.limits?.maxTokens ?? DEFAULT_MAX_TOKENS,
    };
    this.now = options.now ?? (() => new Date());
    this.stateStore = options.stateStore;
    this.writer = options.writer;
  }

  canSpend(estimate: CostEstimate, date = this.getDateKey()): boolean {
    const usage = this.getUsage(date);
    return usage.tokensUsed + estimate.tokens <= this.limits.maxTokens
      && usage.dollarsUsed + estimate.dollars <= this.limits.maxDollars;
  }

  getLimits(): Readonly<Required<DailyBudgetLimits>> {
    return this.limits;
  }

  getUsage(date = this.getDateKey()): DailyBudgetUsage {
    return this.stateStore.read(
      (db) => {
        const row = db
          .prepare(
            `SELECT date, tokens_used, dollars_used, created_at, updated_at
             FROM ${TABLE_SOUL_BUDGETS}
             WHERE date = ?`,
          )
          .get(date) as SoulBudgetRow | undefined;
        return {
          date,
          dollarsUsed: row?.dollars_used ?? 0,
          tokensUsed: row?.tokens_used ?? 0,
        };
      },
      {
        date,
        dollarsUsed: 0,
        tokensUsed: 0,
      },
    );
  }

  async recordSpend(estimate: CostEstimate, date = this.getDateKey()): Promise<void> {
    const now = this.now().toISOString();
    await this.writer.write({
      params: [
        date,
        estimate.tokens,
        estimate.dollars,
        now,
        now,
      ],
      sql: `INSERT INTO ${TABLE_SOUL_BUDGETS} (
              date,
              tokens_used,
              dollars_used,
              created_at,
              updated_at
            )
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(date) DO UPDATE SET
              tokens_used = ${TABLE_SOUL_BUDGETS}.tokens_used + excluded.tokens_used,
              dollars_used = ${TABLE_SOUL_BUDGETS}.dollars_used + excluded.dollars_used,
              updated_at = excluded.updated_at`,
    });
  }

  private getDateKey(): string {
    return this.now().toISOString().slice(0, 10);
  }
}
