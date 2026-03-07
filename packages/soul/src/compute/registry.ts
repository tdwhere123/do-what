import type { SystemHealthEvent } from '@do-what/protocol';
import type { SoulEventPublisher } from '../mcp/types.js';
import type { DailyBudget } from './daily-budget.js';
import type { SummarizeInput } from './provider.js';
import type { ComputeProvider } from './provider.js';

export interface RegisteredComputeProvider {
  priority: number;
  provider: ComputeProvider;
}

export interface ComputeProviderRegistryOptions {
  dailyBudget?: DailyBudget;
  providers?: readonly RegisteredComputeProvider[];
  publishEvent?: SoulEventPublisher;
}

function createSoulModeEvent(
  provider: ComputeProvider,
  soulMode: 'basic' | 'enhanced',
): Omit<SystemHealthEvent, 'revision'> {
  return {
    event: 'soul_mode',
    provider: provider.name,
    runId: 'soul',
    soul_mode: soulMode,
    source: 'soul.compute-registry',
    timestamp: new Date().toISOString(),
  };
}

export class ComputeProviderRegistry {
  private readonly dailyBudget?: DailyBudget;
  private lastPublishedMode: 'basic' | 'enhanced' | null = null;
  private readonly providers = new Map<string, RegisteredComputeProvider>();
  private readonly publishEvent?: SoulEventPublisher;

  constructor(options: ComputeProviderRegistryOptions = {}) {
    this.dailyBudget = options.dailyBudget;
    this.publishEvent = options.publishEvent;
    for (const entry of options.providers ?? []) {
      this.register(entry.provider, entry.priority);
    }
  }

  getBestAvailable(input?: SummarizeInput): ComputeProvider {
    const ordered = this.listProviders();
    const available = ordered.filter((entry) => entry.provider.isAvailable());
    const best = available[0]?.provider ?? ordered[ordered.length - 1]?.provider;
    if (!best) {
      throw new Error('no compute providers registered');
    }

    if (
      input
      && this.dailyBudget
      && best.name !== 'local-heuristics'
      && !this.dailyBudget.canSpend(best.cost_estimate(input))
    ) {
      const fallback = this.getProvider('local-heuristics') ?? best;
      this.publishSoulMode(fallback, 'basic');
      return fallback;
    }

    const soulMode = best.name === 'local-heuristics' ? 'basic' : 'enhanced';
    this.publishSoulMode(best, soulMode);
    return best;
  }

  getProvider(name: string): ComputeProvider | undefined {
    return this.providers.get(name)?.provider;
  }

  listProviders(): RegisteredComputeProvider[] {
    return [...this.providers.values()].sort((left, right) => right.priority - left.priority);
  }

  register(provider: ComputeProvider, priority: number): void {
    this.providers.set(provider.name, {
      priority,
      provider,
    });
  }

  private publishSoulMode(
    provider: ComputeProvider,
    soulMode: 'basic' | 'enhanced',
  ): void {
    if (!this.publishEvent || this.lastPublishedMode === soulMode) {
      return;
    }

    this.lastPublishedMode = soulMode;
    this.publishEvent(createSoulModeEvent(provider, soulMode));
  }
}
