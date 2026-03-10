import type { CoreConnectionState } from '@do-what/protocol';
import type { NormalizedCoreEvent } from '../events/normalized-core-event';

export interface CoreSessionTransition {
  readonly nextCoreSessionId: string;
  readonly previousCoreSessionId: string | null;
  readonly revision: number;
  readonly type: 'changed' | 'initialized';
}

export class CoreSessionGuard {
  private connectionState: CoreConnectionState = 'disconnected';
  private currentCoreSessionId: string | null = null;

  getConnectionState(): CoreConnectionState {
    return this.connectionState;
  }

  getCurrentCoreSessionId(): string | null {
    return this.currentCoreSessionId;
  }

  observe(event: NormalizedCoreEvent): CoreSessionTransition | null {
    if (!event.coreSessionId) {
      return null;
    }

    if (this.currentCoreSessionId === null) {
      this.currentCoreSessionId = event.coreSessionId;
      return {
        nextCoreSessionId: event.coreSessionId,
        previousCoreSessionId: null,
        revision: event.revision,
        type: 'initialized',
      };
    }

    if (this.currentCoreSessionId !== event.coreSessionId) {
      const previousCoreSessionId = this.currentCoreSessionId;
      this.currentCoreSessionId = event.coreSessionId;
      return {
        nextCoreSessionId: event.coreSessionId,
        previousCoreSessionId,
        revision: event.revision,
        type: 'changed',
      };
    }

    return null;
  }

  reset(): void {
    this.currentCoreSessionId = null;
  }

  setConnectionState(state: CoreConnectionState): void {
    this.connectionState = state;
  }
}
