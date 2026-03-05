import type { ServerResponse } from 'node:http';
import type { BaseEvent } from '@do-what/protocol';

const SSE_HEADERS = {
  'Cache-Control': 'no-cache',
  Connection: 'keep-alive',
  'Content-Type': 'text/event-stream',
  'X-Accel-Buffering': 'no',
} as const;

export class SseManager {
  private readonly connections = new Set<ServerResponse>();

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
    const payload = `data: ${JSON.stringify(event)}\n\n`;

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
