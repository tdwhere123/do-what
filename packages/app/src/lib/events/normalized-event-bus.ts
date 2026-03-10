import type { CoreConnectionState, CoreError } from '@do-what/protocol';
import type { CoreSessionTransition } from '../core-session-guard/core-session-guard';
import type { NormalizedCoreEvent } from './normalized-core-event';

export type EventBusMessage =
  | { readonly event: NormalizedCoreEvent; readonly kind: 'event' }
  | { readonly kind: 'connection'; readonly state: CoreConnectionState }
  | { readonly error: CoreError; readonly kind: 'error' }
  | { readonly kind: 'session'; readonly transition: CoreSessionTransition };

export type EventBusListener = (message: EventBusMessage) => void;

export class NormalizedEventBus {
  private readonly listeners = new Set<EventBusListener>();

  subscribe(listener: EventBusListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  dispatchConnection(state: CoreConnectionState): void {
    this.emit({
      kind: 'connection',
      state,
    });
  }

  dispatchError(error: CoreError): void {
    this.emit({
      error,
      kind: 'error',
    });
  }

  dispatchEvent(event: NormalizedCoreEvent): void {
    this.emit({
      event,
      kind: 'event',
    });
  }

  dispatchSession(transition: CoreSessionTransition): void {
    this.emit({
      kind: 'session',
      transition,
    });
  }

  size(): number {
    return this.listeners.size;
  }

  private emit(message: EventBusMessage): void {
    for (const listener of this.listeners) {
      listener(message);
    }
  }
}
