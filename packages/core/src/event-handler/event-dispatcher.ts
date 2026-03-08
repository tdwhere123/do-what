import type { BaseEvent } from '@do-what/protocol';
import type { EventBus } from '../eventbus/event-bus.js';
import type { AckTracker } from '../state/ack-tracker.js';
import { runSyncPath } from './sync-path.js';

export interface EventDispatcherOptions {
  ackTracker: AckTracker;
  eventBus: EventBus;
}

export class EventDispatcher {
  private readonly ackTracker: AckTracker;
  private readonly eventBus: EventBus;

  constructor(options: EventDispatcherOptions) {
    this.ackTracker = options.ackTracker;
    this.eventBus = options.eventBus;
  }

  dispatch(event: Omit<BaseEvent, 'revision'> | BaseEvent) {
    const result = runSyncPath(this.eventBus, this.ackTracker, event);
    queueMicrotask(() => {
      this.ackTracker.markCommitted(result.ack.ack_id);
    });
    return result;
  }
}

