import type { ServerResponse } from 'node:http';
import {
  CoreSseEnvelopeSchema,
  type BaseEvent,
  type CoreSseCause,
} from '@do-what/protocol';

const SSE_HEADERS = {
  'Cache-Control': 'no-cache',
  Connection: 'keep-alive',
  'Content-Type': 'text/event-stream',
  'X-Accel-Buffering': 'no',
} as const;

export class SseManager {
  private readonly connections = new Set<ServerResponse>();
  private readonly coreSessionId: string;
  private readonly resolveCause?: (revision: number) => CoreSseCause | null;

  constructor(options: {
    coreSessionId: string;
    resolveCause?: (revision: number) => CoreSseCause | null;
  }) {
    this.coreSessionId = options.coreSessionId;
    this.resolveCause = options.resolveCause;
  }

  subscribe(response: ServerResponse): void {
    response.writeHead(200, SSE_HEADERS);
    response.write(': connected\n\n');

    this.connections.add(response);

    const cleanup = () => {
      this.connections.delete(response);
    };

    response.on('close', cleanup);
    response.on('error', cleanup);
  }

  broadcast(event: BaseEvent): void {
    const payload = `data: ${JSON.stringify(
      CoreSseEnvelopeSchema.parse({
        causedBy:
          readCause((event as Record<string, unknown>).causedBy)
          ?? this.resolveCause?.(event.revision)
          ?? undefined,
        coreSessionId: this.coreSessionId,
        event,
        revision: event.revision,
      }),
    )}\n\n`;

    for (const connection of this.connections) {
      if (connection.writableEnded || connection.destroyed) {
        this.connections.delete(connection);
        continue;
      }

      connection.write(payload);
    }
  }

  closeAll(): void {
    for (const connection of this.connections) {
      if (!connection.writableEnded) {
        connection.end();
      }
    }

    this.connections.clear();
  }

  size(): number {
    return this.connections.size;
  }
}

function readCause(value: unknown): CoreSseCause | undefined {
  if (typeof value !== 'object' || value === null) {
    return undefined;
  }

  const ackId = readString((value as Record<string, unknown>).ackId);
  const clientCommandId = readString(
    (value as Record<string, unknown>).clientCommandId,
  );
  if (!ackId && !clientCommandId) {
    return undefined;
  }

  return {
    ackId,
    clientCommandId,
  };
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}
