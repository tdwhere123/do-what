import { randomUUID } from 'node:crypto';
import type { AckEntityType, AckOverlay, CoreSseCause } from '@do-what/protocol';

export interface AckTrackerOptions {
  cleanupDelayMs?: number;
  maxRevisionCauses?: number;
  now?: () => string;
  pendingTimeoutMs?: number;
}

export interface CreateAckInput {
  causedBy?: Omit<CoreSseCause, 'ackId'>;
  entity_id: string;
  entity_type: AckEntityType;
  revision: number;
}

const DEFAULT_CLEANUP_DELAY_MS = 60_000;
const DEFAULT_MAX_REVISION_CAUSES = 2_048;
const DEFAULT_PENDING_TIMEOUT_MS = 30_000;

export class AckTracker {
  private readonly acks = new Map<string, AckOverlay>();
  private readonly ackCauses = new Map<string, CoreSseCause>();
  private readonly cleanupDelayMs: number;
  private readonly cleanupTimers = new Map<string, NodeJS.Timeout>();
  private readonly maxRevisionCauses: number;
  private readonly now: () => string;
  private readonly pendingTimeoutMs: number;
  private readonly pendingTimers = new Map<string, NodeJS.Timeout>();
  private readonly revisionCauseOrder: number[] = [];
  private readonly revisionCauses = new Map<number, CoreSseCause>();

  constructor(options: AckTrackerOptions = {}) {
    this.cleanupDelayMs = options.cleanupDelayMs ?? DEFAULT_CLEANUP_DELAY_MS;
    this.maxRevisionCauses = options.maxRevisionCauses ?? DEFAULT_MAX_REVISION_CAUSES;
    this.now = options.now ?? (() => new Date().toISOString());
    this.pendingTimeoutMs = options.pendingTimeoutMs ?? DEFAULT_PENDING_TIMEOUT_MS;
  }

  close(): void {
    for (const timer of this.cleanupTimers.values()) {
      clearTimeout(timer);
    }
    for (const timer of this.pendingTimers.values()) {
      clearTimeout(timer);
    }
    this.cleanupTimers.clear();
    this.pendingTimers.clear();
    this.ackCauses.clear();
    this.revisionCauseOrder.length = 0;
    this.revisionCauses.clear();
    this.acks.clear();
  }

  createPending(input: CreateAckInput): AckOverlay {
    const ack: AckOverlay = {
      ack_id: randomUUID(),
      created_at: this.now(),
      entity_id: input.entity_id,
      entity_type: input.entity_type,
      revision: input.revision,
      status: 'pending',
    };
    this.acks.set(ack.ack_id, ack);
    if (input.causedBy) {
      const cause: CoreSseCause = {
        ackId: ack.ack_id,
        clientCommandId:
          typeof input.causedBy.clientCommandId === 'string'
            ? input.causedBy.clientCommandId
            : undefined,
      };
      this.ackCauses.set(ack.ack_id, cause);
      this.storeRevisionCause(input.revision, cause);
    }
    this.armPendingTimeout(ack.ack_id);
    return ack;
  }

  getCauseForRevision(revision: number): CoreSseCause | null {
    const cause = this.revisionCauses.get(revision);
    return cause ? { ...cause } : null;
  }

  get(ackId: string): AckOverlay | null {
    const ack = this.acks.get(ackId);
    return ack ? { ...ack } : null;
  }

  setRevision(ackId: string, revision: number): AckOverlay | null {
    const ack = this.acks.get(ackId);
    if (!ack) {
      return null;
    }

    const nextAck: AckOverlay = {
      ...ack,
      revision,
    };
    this.acks.set(ackId, nextAck);
    this.storeRevisionCause(revision, this.ackCauses.get(ackId));
    return { ...nextAck };
  }

  markCommitted(ackId: string): AckOverlay | null {
    const ack = this.acks.get(ackId);
    if (!ack || ack.status !== 'pending') {
      return ack ? { ...ack } : null;
    }

    const nextAck: AckOverlay = {
      ...ack,
      committed_at: this.now(),
      status: 'committed',
    };
    this.acks.set(ackId, nextAck);
    this.clearPendingTimer(ackId);
    this.armCleanup(ackId);
    return { ...nextAck };
  }

  markFailed(ackId: string, error?: string): AckOverlay | null {
    const ack = this.acks.get(ackId);
    if (!ack) {
      return null;
    }

    const nextAck: AckOverlay = {
      ...ack,
      committed_at: this.now(),
      error,
      status: 'failed',
    };
    this.acks.set(ackId, nextAck);
    this.clearPendingTimer(ackId);
    this.armCleanup(ackId);
    return { ...nextAck };
  }

  private armCleanup(ackId: string): void {
    this.clearCleanupTimer(ackId);
    const timer = setTimeout(() => {
      this.ackCauses.delete(ackId);
      this.acks.delete(ackId);
      this.cleanupTimers.delete(ackId);
      this.pendingTimers.delete(ackId);
    }, this.cleanupDelayMs);
    timer.unref();
    this.cleanupTimers.set(ackId, timer);
  }

  private armPendingTimeout(ackId: string): void {
    this.clearPendingTimer(ackId);
    const timer = setTimeout(() => {
      this.markFailed(ackId, 'async path timeout');
    }, this.pendingTimeoutMs);
    timer.unref();
    this.pendingTimers.set(ackId, timer);
  }

  private clearCleanupTimer(ackId: string): void {
    const timer = this.cleanupTimers.get(ackId);
    if (timer) {
      clearTimeout(timer);
      this.cleanupTimers.delete(ackId);
    }
  }

  private clearPendingTimer(ackId: string): void {
    const timer = this.pendingTimers.get(ackId);
    if (timer) {
      clearTimeout(timer);
      this.pendingTimers.delete(ackId);
    }
  }

  private storeRevisionCause(
    revision: number,
    cause: CoreSseCause | undefined,
  ): void {
    if (!cause || revision <= 0) {
      return;
    }

    if (!this.revisionCauses.has(revision)) {
      this.revisionCauseOrder.push(revision);
    }
    this.revisionCauses.set(revision, { ...cause });

    while (this.revisionCauseOrder.length > this.maxRevisionCauses) {
      const evictedRevision = this.revisionCauseOrder.shift();
      if (typeof evictedRevision === 'number') {
        this.revisionCauses.delete(evictedRevision);
      }
    }
  }
}

