import { randomUUID } from 'node:crypto';
import type {
  ClaimSupersededEvent,
  MemoryCueAcceptedEvent,
  MemoryCueModifiedEvent,
  MemoryCueRejectedEvent,
  SoulEvent,
  UserDecision,
  UserDecisionContextSnapshot,
  UserDecisionType,
} from '@do-what/protocol';
import { UserDecisionSchema } from '@do-what/protocol';
import { LedgerWriter } from './ledger-writer.js';

type RecordedEvent =
  | ClaimSupersededEvent
  | MemoryCueAcceptedEvent
  | MemoryCueModifiedEvent
  | MemoryCueRejectedEvent;

export interface DecisionRecorderContext {
  claim_draft_id?: string;
  linked_capsule_id?: string;
  user_note?: string;
  context_snapshot: UserDecisionContextSnapshot;
}

export interface DecisionRecorderOptions {
  ledgerWriter: LedgerWriter;
  now?: () => Date;
  recentWindowMs?: number;
  warn?: (message: string, error?: unknown) => void;
}

function getDecisionType(event: RecordedEvent): UserDecisionType | null {
  switch (event.event) {
    case 'memory_cue_accepted':
      return 'accept';
    case 'memory_cue_rejected':
      return 'reject';
    case 'memory_cue_modified':
      return 'modify';
    case 'claim_superseded':
      return 'supersede';
    default:
      return null;
  }
}

function getLinkedMemoryId(event: RecordedEvent): string | null {
  switch (event.event) {
    case 'memory_cue_accepted':
    case 'memory_cue_modified':
      return event.cueId;
    case 'claim_superseded':
      return event.cueId;
    case 'memory_cue_rejected':
      return event.cueId ?? null;
    default:
      return null;
  }
}

export class DecisionRecorder {
  private readonly ledgerWriter: LedgerWriter;
  private readonly now: () => Date;
  private readonly recentWindowMs: number;
  private readonly warn: (message: string, error?: unknown) => void;
  private readonly pendingWrites = new Set<Promise<void>>();
  private readonly recentWrites = new Map<string, number>();
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(options: DecisionRecorderOptions) {
    this.ledgerWriter = options.ledgerWriter;
    this.now = options.now ?? (() => new Date());
    this.recentWindowMs = options.recentWindowMs ?? 60_000;
    this.warn = options.warn ?? ((message, error) => {
      console.warn(message, error);
    });
  }

  async recordEvent(
    event: SoulEvent,
    context: DecisionRecorderContext,
  ): Promise<UserDecision | null> {
    if (!isRecordedEvent(event)) {
      return null;
    }

    const decisionType = getDecisionType(event);
    const linkedMemoryId = getLinkedMemoryId(event);
    if (!decisionType || !linkedMemoryId) {
      return null;
    }

    const dedupeKey = `${decisionType}:${linkedMemoryId}`;
    const nowTimestamp = this.now().getTime();
    const lastWrite = this.recentWrites.get(dedupeKey);
    if (lastWrite && nowTimestamp - lastWrite < this.recentWindowMs) {
      return null;
    }

    const decision = UserDecisionSchema.parse({
      claim_draft_id:
        context.claim_draft_id
        ?? ('claimDraftId' in event && typeof event.claimDraftId === 'string'
          ? event.claimDraftId
          : 'draftId' in event && typeof event.draftId === 'string'
            ? event.draftId
            : undefined),
      context_snapshot: {
        ...context.context_snapshot,
        run_id: context.context_snapshot.run_id ?? event.runId,
        workspace_id:
          context.context_snapshot.workspace_id
          || ('projectId' in event && typeof event.projectId === 'string'
            ? event.projectId
            : ''),
      },
      decision_id: randomUUID(),
      decision_type: decisionType,
      linked_capsule_id: context.linked_capsule_id,
      linked_memory_id: linkedMemoryId,
      timestamp: this.now().toISOString(),
      user_note: trimUserNote(context.user_note),
    });

    this.recentWrites.set(dedupeKey, nowTimestamp);
    try {
      await this.ledgerWriter.append(decision);
      return decision;
    } catch (error) {
      if (this.recentWrites.get(dedupeKey) === nowTimestamp) {
        this.recentWrites.delete(dedupeKey);
      }
      throw error;
    }
  }

  attach(subscriber: {
    off: (eventType: string, listener: (event: unknown) => void) => void;
    on: (eventType: string, listener: (event: unknown) => void) => void;
  }, contextProvider: (event: RecordedEvent) => Promise<DecisionRecorderContext | null>) {
    const listeners = new Map<string, (event: unknown) => void>();
    const eventTypes = [
      'memory_cue_accepted',
      'memory_cue_rejected',
      'memory_cue_modified',
      'claim_superseded',
    ] as const;

    for (const eventType of eventTypes) {
      const listener = (event: unknown) => {
        if (!isRecordedEvent(event)) {
          return;
        }
        this.track(
          this.enqueue(async () => {
            const context = await contextProvider(event);
            if (!context) {
              return;
            }

            await this.recordEvent(event, context);
          }).catch((error) => {
            this.warn('[soul][ledger] failed to record decision event', error);
          }),
        );
      };
      listeners.set(eventType, listener);
      subscriber.on(eventType, listener);
    }

    return () => {
      for (const [eventType, listener] of listeners) {
        subscriber.off(eventType, listener);
      }
    };
  }

  async flush(): Promise<void> {
    while (this.pendingWrites.size > 0) {
      await Promise.allSettled([...this.pendingWrites]);
    }
  }

  private track(task: Promise<void>): void {
    this.pendingWrites.add(task);
    void task.finally(() => {
      this.pendingWrites.delete(task);
    });
  }

  private enqueue(taskFactory: () => Promise<void>): Promise<void> {
    const task = this.writeQueue.then(taskFactory, taskFactory);
    this.writeQueue = task.catch(() => undefined);
    return task;
  }
}

function isRecordedEvent(event: unknown): event is RecordedEvent {
  if (!event || typeof event !== 'object' || !('event' in event)) {
    return false;
  }

  const eventName = (event as { event?: unknown }).event;
  return (
    eventName === 'memory_cue_accepted'
    || eventName === 'memory_cue_rejected'
    || eventName === 'memory_cue_modified'
    || eventName === 'claim_superseded'
  );
}

function trimUserNote(value: string | undefined): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  return value.length > 500 ? value.slice(0, 500) : value;
}
