import type { CoreConnectionState, CoreError, CoreSseEnvelope } from '@do-what/protocol';

export interface CoreEventSourceHandlers {
  readonly onConnectionStateChange: (state: CoreConnectionState) => void;
  readonly onEnvelope: (envelope: CoreSseEnvelope) => void;
  readonly onError: (error: CoreError) => void;
}

export interface CoreEventSource {
  start(handlers: CoreEventSourceHandlers): () => void;
}
