import type { BaseEvent, ProjectionEntry, ProjectionKind } from '@do-what/protocol';

interface ProjectionCacheRecord<T> {
  readonly computedAt: number;
  readonly data: T;
}

type ProjectionLoader = (scopeId: string) => Promise<unknown>;

interface ProjectionDefinition {
  readonly load: ProjectionLoader;
  readonly ttlMs: number;
}

export interface ProjectionManagerOptions {
  definitions: Record<ProjectionKind, ProjectionDefinition>;
  now?: () => number;
}

function createKey(kind: ProjectionKind, scopeId: string): string {
  return `${kind}:${scopeId}`;
}

export class ProjectionManager {
  private readonly cache = new Map<string, ProjectionCacheRecord<unknown>>();
  private readonly definitions: Record<ProjectionKind, ProjectionDefinition>;
  private readonly inflight = new Map<string, Promise<ProjectionEntry<unknown>>>();
  private readonly now: () => number;

  constructor(options: ProjectionManagerOptions) {
    this.definitions = options.definitions;
    this.now = options.now ?? (() => Date.now());
  }

  async get<T>(kind: ProjectionKind, scopeId: string): Promise<ProjectionEntry<T>> {
    const definition = this.definitions[kind];
    const key = createKey(kind, scopeId);
    const currentTime = this.now();
    const cached = this.cache.get(key);
    if (cached && currentTime - cached.computedAt <= definition.ttlMs) {
      return {
        computed_at: new Date(cached.computedAt).toISOString(),
        data: cached.data as T,
        kind,
        scope_id: scopeId,
        staleness_ms: currentTime - cached.computedAt,
      };
    }

    const existing = this.inflight.get(key);
    if (existing) {
      return existing as Promise<ProjectionEntry<T>>;
    }

    const task = (async () => {
      const data = await definition.load(scopeId);
      const computedAt = this.now();
      this.cache.set(key, {
        computedAt,
        data,
      });
      return {
        computed_at: new Date(computedAt).toISOString(),
        data: data as T,
        kind,
        scope_id: scopeId,
        staleness_ms: 0,
      };
    })().finally(() => {
      this.inflight.delete(key);
    });

    this.inflight.set(key, task);
    return task as Promise<ProjectionEntry<T>>;
  }

  handleEvent(event: BaseEvent): void {
    const candidate = event as BaseEvent & Record<string, unknown>;
    if (candidate.operation === 'propose' || candidate.operation === 'commit') {
      this.invalidateKind('pending_soul_proposals');
      return;
    }

    if (
      candidate.event === 'memory_cue_accepted'
      || candidate.event === 'memory_cue_rejected'
      || candidate.event === 'memory_cue_modified'
      || candidate.event === 'claim_superseded'
    ) {
      this.invalidateKind('pending_soul_proposals');
      return;
    }
  }

  invalidate(kind: ProjectionKind, scopeId: string): void {
    this.cache.delete(createKey(kind, scopeId));
  }

  invalidateKind(kind: ProjectionKind): void {
    const prefix = `${kind}:`;
    for (const key of this.cache.keys()) {
      if (key.startsWith(prefix)) {
        this.cache.delete(key);
      }
    }
  }
}

