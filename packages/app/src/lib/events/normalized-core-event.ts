import type { AnyEvent, CoreSseCause, CoreSseEnvelope } from '@do-what/protocol';

export interface NormalizedCoreEvent {
  readonly causedBy?: CoreSseCause;
  readonly coreSessionId: string | null;
  readonly event: AnyEvent;
  readonly revision: number;
  readonly runId: string;
  readonly type: string;
  readonly workspaceId: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function extractType(event: AnyEvent): string {
  if ('type' in event && typeof event.type === 'string') {
    return event.type;
  }

  if ('status' in event && typeof event.status === 'string') {
    return event.status;
  }

  if ('event' in event && typeof event.event === 'string') {
    return event.event;
  }

  return 'unknown';
}

function extractWorkspaceId(event: AnyEvent): string | null {
  if (isRecord(event) && typeof event.workspaceId === 'string') {
    return event.workspaceId;
  }

  return null;
}

function extractCausedBy(
  envelope: CoreSseEnvelope,
  event: AnyEvent,
): CoreSseCause | undefined {
  if (envelope.causedBy) {
    return envelope.causedBy;
  }

  if (isRecord(event) && isRecord(event.causedBy)) {
    return {
      ackId:
        typeof event.causedBy.ackId === 'string' ? event.causedBy.ackId : undefined,
      clientCommandId:
        typeof event.causedBy.clientCommandId === 'string'
          ? event.causedBy.clientCommandId
          : undefined,
    };
  }

  return undefined;
}

export function normalizeCoreEvent(envelope: CoreSseEnvelope): NormalizedCoreEvent {
  const event = envelope.event;

  return {
    causedBy: extractCausedBy(envelope, event),
    coreSessionId: envelope.coreSessionId ?? null,
    event,
    revision: envelope.revision,
    runId: event.runId,
    type: extractType(event),
    workspaceId: extractWorkspaceId(event),
  };
}
