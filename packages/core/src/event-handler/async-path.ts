import type { BaseEvent } from '@do-what/protocol';
import type { ProjectionManager } from '../projection/index.js';
import type { SseManager } from '../server/sse.js';

export function attachAsyncEventPath(options: {
  eventBus: {
    onAny: (listener: (event: BaseEvent) => void) => void;
  };
  projectionManager: ProjectionManager;
  sseManager: SseManager;
}): void {
  options.eventBus.onAny((event) => {
    queueMicrotask(() => {
      options.sseManager.broadcast(event);
      options.projectionManager.handleEvent(event);
    });
  });
}

