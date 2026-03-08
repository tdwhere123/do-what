import type { BaseEvent } from '@do-what/protocol';
import type { AckTracker } from '../state/ack-tracker.js';
import type { EventBus } from '../eventbus/event-bus.js';

function deriveEntityType(event: BaseEvent): 'approval' | 'checkpoint' | 'engine' | 'event' | 'run' {
  const candidate = event as BaseEvent & Record<string, unknown>;
  if (candidate.event === 'run_checkpoint') {
    return 'checkpoint';
  }
  if (
    candidate.event === 'engine_connect'
    || candidate.event === 'engine_disconnect'
    || candidate.event === 'circuit_break'
  ) {
    return 'engine';
  }
  if (candidate.status === 'waiting_approval' && typeof candidate.approvalId === 'string') {
    return 'approval';
  }
  if (
    candidate.status === 'created'
    || candidate.status === 'started'
    || candidate.status === 'completed'
    || candidate.status === 'failed'
    || candidate.status === 'cancelled'
    || candidate.status === 'interrupted'
    || candidate.status === 'waiting_approval'
  ) {
    return 'run';
  }
  return 'event';
}

function deriveEntityId(event: BaseEvent): string {
  const candidate = event as BaseEvent & Record<string, unknown>;
  if (candidate.event === 'run_checkpoint' && typeof candidate.checkpointId === 'string') {
    return candidate.checkpointId;
  }
  if (
    (candidate.event === 'engine_connect'
      || candidate.event === 'engine_disconnect'
      || candidate.event === 'circuit_break')
    && typeof candidate.engineType === 'string'
  ) {
    return candidate.engineType;
  }
  if (candidate.status === 'waiting_approval' && typeof candidate.approvalId === 'string') {
    return candidate.approvalId;
  }
  return event.runId;
}

export function runSyncPath(
  eventBus: EventBus,
  ackTracker: AckTracker,
  event: Omit<BaseEvent, 'revision'> | BaseEvent,
) {
  const published = eventBus.publish(event);
  const ack = ackTracker.createPending({
    entity_id: deriveEntityId(published),
    entity_type: deriveEntityType(published),
    revision: published.revision,
  });

  return {
    ack,
    event: published,
  };
}

