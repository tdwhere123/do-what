import type { BaseEvent } from '@do-what/protocol';
import EventEmitter from 'node:events';
import type { WorkerClient } from '../db/worker-client.js';
import { RevisionCounter } from './revision-counter.js';
import type { SseManager } from '../server/sse.js';

type EventListener<T extends BaseEvent = BaseEvent> = (event: T) => void;

export interface EventBusOptions {
  revisionCounter?: RevisionCounter;
  sseManager: SseManager;
  workerClient: WorkerClient;
}

function getEventChannel(event: BaseEvent): string {
  const candidate = event as BaseEvent & {
    event?: unknown;
    eventType?: unknown;
    status?: unknown;
    type?: unknown;
  };

  // event_log.event_type precedence is fixed to keep history queries stable.
  if (typeof candidate.eventType === 'string') {
    return candidate.eventType;
  }
  if (typeof candidate.type === 'string') {
    return candidate.type;
  }
  if (typeof candidate.event === 'string') {
    return candidate.event;
  }
  if (typeof candidate.status === 'string') {
    return `status:${candidate.status}`;
  }
  return 'event';
}

export class EventBus {
  private readonly emitter = new EventEmitter();
  private readonly revisionCounter: RevisionCounter;
  private readonly sseManager: SseManager;
  private readonly workerClient: WorkerClient;

  constructor(options: EventBusOptions) {
    this.revisionCounter = options.revisionCounter ?? new RevisionCounter();
    this.sseManager = options.sseManager;
    this.workerClient = options.workerClient;
  }

  off(eventType: string, listener: EventListener): void {
    this.emitter.off(eventType, listener);
  }

  on(eventType: string, listener: EventListener): void {
    this.emitter.on(eventType, listener);
  }

  publish(event: Omit<BaseEvent, 'revision'> | BaseEvent): BaseEvent {
    const assignedRevision = this.revisionCounter.next();
    const eventWithRevision = {
      ...event,
      revision: assignedRevision,
    } as BaseEvent;

    this.workerClient
      .write({
        params: [
          eventWithRevision.revision,
          eventWithRevision.timestamp,
          getEventChannel(eventWithRevision),
          eventWithRevision.runId,
          eventWithRevision.source,
          JSON.stringify(eventWithRevision),
        ],
        sql: `INSERT INTO event_log (revision, timestamp, event_type, run_id, source, payload)
              VALUES (?, ?, ?, ?, ?, ?)`,
      })
      .catch((error) => {
        if (error?.message !== 'worker client closed') {
          console.warn('[core][event-bus] failed to write event log', error);
        }
      });

    this.sseManager.broadcast(eventWithRevision);
    this.emitter.emit(getEventChannel(eventWithRevision), eventWithRevision);
    return eventWithRevision;
  }
}
