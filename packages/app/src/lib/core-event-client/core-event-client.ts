import type { CoreEventSource } from './core-event-source';
import { normalizeCoreEvent } from '../events/normalized-core-event';
import type { NormalizedEventBus } from '../events/normalized-event-bus';
import type { CoreSessionGuard } from '../core-session-guard/core-session-guard';

export interface CoreEventClient {
  start(): () => void;
  stop(): void;
}

export interface CreateCoreEventClientOptions {
  readonly eventBus: NormalizedEventBus;
  readonly eventSource: CoreEventSource;
  readonly sessionGuard: CoreSessionGuard;
}

export function createCoreEventClient(
  options: CreateCoreEventClientOptions,
): CoreEventClient {
  let stopSource: (() => void) | null = null;

  return {
    start() {
      if (stopSource) {
        return stopSource;
      }

      stopSource = options.eventSource.start({
        onConnectionStateChange: (state) => {
          options.sessionGuard.setConnectionState(state);
          options.eventBus.dispatchConnection(state);
        },
        onEnvelope: (envelope) => {
          const normalizedEvent = normalizeCoreEvent(envelope);
          const transition = options.sessionGuard.observe(normalizedEvent);
          options.eventBus.dispatchEvent(normalizedEvent);
          if (transition) {
            options.eventBus.dispatchSession(transition);
          }
        },
        onError: (error) => {
          options.eventBus.dispatchError(error);
        },
      });

      return stopSource;
    },

    stop() {
      if (!stopSource) {
        return;
      }

      stopSource();
      stopSource = null;
    },
  };
}
