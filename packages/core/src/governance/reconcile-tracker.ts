import type { DriftKind, MergeDecision } from '@do-what/protocol';

export class ReconcileTracker {
  private readonly counts = new Map<string, number>();

  clear(runId: string): void {
    this.counts.delete(runId);
  }

  get(runId: string): number {
    return this.counts.get(runId) ?? 0;
  }

  decide(runId: string, driftKind: DriftKind): MergeDecision {
    if (driftKind === 'ignore') {
      return {
        allowed: true,
        reason: 'no_drift',
        reconcile_count: this.get(runId),
      };
    }

    if (driftKind === 'soft_stale') {
      return {
        allowed: true,
        reason: 'soft_stale_ok',
        reconcile_count: this.get(runId),
      };
    }

    const currentCount = this.get(runId);
    if (currentCount === 0) {
      this.counts.set(runId, 1);
      return {
        allowed: true,
        reason: 'hard_stale_reconcile',
        reconcile_count: 1,
      };
    }

    return {
      allowed: false,
      reason: 'hard_stale_serialize',
      reconcile_count: currentCount,
    };
  }
}
