import type { MemoryOperationEvent } from '@do-what/protocol';
import type { SoulEventPublisher } from './types.js';

export function createMemoryEvent(
  payload: Omit<MemoryOperationEvent, 'revision' | 'runId' | 'source' | 'timestamp'>,
): Omit<MemoryOperationEvent, 'revision'> {
  return {
    ...payload,
    runId: 'soul',
    source: 'soul.module',
    timestamp: new Date().toISOString(),
  };
}

export function publishMemoryEvent(
  publisher: SoulEventPublisher | undefined,
  event: Omit<MemoryOperationEvent, 'revision'>,
): void {
  if (!publisher) {
    return;
  }

  try {
    publisher(event);
  } catch (error) {
    console.warn('[soul][mcp] failed to publish memory event', error);
  }
}
