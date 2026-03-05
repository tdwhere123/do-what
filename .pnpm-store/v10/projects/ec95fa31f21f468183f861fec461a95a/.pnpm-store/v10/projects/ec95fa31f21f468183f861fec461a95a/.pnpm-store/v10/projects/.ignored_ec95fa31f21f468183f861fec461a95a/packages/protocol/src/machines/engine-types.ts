import type { EventObject } from 'xstate';

import type { SystemHealthEvent } from '../events/system.js';

export type EngineConnectionStatus =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'degraded'
  | 'circuit_open';

export interface EngineContext {
  engineType: string;
  connectionStatus: EngineConnectionStatus;
  version?: string;
  pid?: number;
  failureCount: number;
}

export type EngineEvent =
  | ({
      type: 'CONNECT';
      data: Extract<SystemHealthEvent, { event: 'engine_connect' }>;
    } & EventObject)
  | ({
      type: 'DISCONNECT';
      data: Extract<SystemHealthEvent, { event: 'engine_disconnect' }>;
    } & EventObject)
  | ({
      type: 'CIRCUIT_BREAK';
      data: Extract<SystemHealthEvent, { event: 'circuit_break' }>;
    } & EventObject)
  | ({
      type: 'HEARTBEAT_TIMEOUT';
      engineType: string;
      at: string;
    } & EventObject);
