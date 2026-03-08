import type {
  ClaimSupersededEvent,
  ContextCueUsedEvent,
  MemoryCueAcceptedEvent,
  MemoryCueRejectedEvent,
} from '@do-what/protocol';
import { TABLE_MEMORY_CUES } from '../db/schema.js';
import type { SoulStateStore } from '../db/soul-state-store.js';
import type { SoulWorkerClient } from '../db/worker-client.js';
import { updateActivation } from './activation.js';
import type { KarmaEvent } from './karma.js';

type SupportedEvent =
  | ClaimSupersededEvent
  | ContextCueUsedEvent
  | MemoryCueAcceptedEvent
  | MemoryCueRejectedEvent;

interface ActivationRow {
  activation_score: number;
}

export interface KarmaListenerOptions {
  stateStore: SoulStateStore;
  writer: SoulWorkerClient;
}

export class KarmaListener {
  private readonly stateStore: SoulStateStore;
  private readonly writer: SoulWorkerClient;

  constructor(options: KarmaListenerOptions) {
    this.stateStore = options.stateStore;
    this.writer = options.writer;
  }

  attach(subscriber: {
    off: (eventType: string, listener: (event: unknown) => void) => void;
    on: (eventType: string, listener: (event: unknown) => void) => void;
  }): () => void {
    const listeners = new Map<string, (event: unknown) => void>();
    const eventTypes = [
      'memory_cue_accepted',
      'memory_cue_rejected',
      'context_cue_used',
      'claim_superseded',
    ] as const;

    for (const eventType of eventTypes) {
      const listener = (event: unknown) => {
        const karmaEvent = mapToKarmaEvent(event);
        if (!karmaEvent) {
          return;
        }
        void this.apply(karmaEvent);
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

  async apply(karmaEvent: KarmaEvent): Promise<void> {
    const current = this.stateStore.read(
      (db) =>
        (db
          .prepare(
            `SELECT activation_score
             FROM ${TABLE_MEMORY_CUES}
             WHERE cue_id = ?`,
          )
          .get(karmaEvent.cue_id) as ActivationRow | undefined) ?? null,
      null,
    );
    if (!current) {
      return;
    }

    const next = updateActivation(
      current.activation_score ?? 0,
      karmaEvent,
      new Date(),
    );
    await this.writer.write({
      params: [next, new Date().toISOString(), karmaEvent.cue_id],
      sql: `UPDATE ${TABLE_MEMORY_CUES}
            SET activation_score = ?,
                updated_at = ?
            WHERE cue_id = ?`,
    });
  }
}

function mapToKarmaEvent(event: unknown): KarmaEvent | null {
  if (!event || typeof event !== 'object' || !('event' in event)) {
    return null;
  }

  const typedEvent = event as SupportedEvent;
  switch (typedEvent.event) {
    case 'memory_cue_accepted':
      return {
        cue_id: typedEvent.cueId,
        karma_type: 'accept',
        occurred_at: typedEvent.timestamp,
        triggered_by: typedEvent.resolver === 'user' ? 'user' : 'engine',
      };
    case 'memory_cue_rejected':
      return typedEvent.cueId
        ? {
            cue_id: typedEvent.cueId,
            karma_type: 'reject',
            occurred_at: typedEvent.timestamp,
            triggered_by: typedEvent.resolver === 'user' ? 'user' : 'engine',
          }
        : null;
    case 'context_cue_used':
      return {
        cue_id: typedEvent.cueId,
        karma_type: 'reuse',
        occurred_at: typedEvent.timestamp,
        triggered_by: 'engine',
      };
    case 'claim_superseded':
      return {
        cue_id: typedEvent.cueId,
        karma_type: 'supersede',
        occurred_at: typedEvent.timestamp,
        triggered_by: 'user',
      };
    default:
      return null;
  }
}
