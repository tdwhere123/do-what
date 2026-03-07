import type { SystemHealthEvent } from '@do-what/protocol';
import { assign, createActor, setup, type ActorRefFrom } from 'xstate';

export interface EngineMachineInput {
  circuitOpenThreshold?: number;
  engineType: string;
  eventBus?: {
    publish: (event: Omit<SystemHealthEvent, 'revision'>) => unknown;
  };
  now?: () => string;
  source?: string;
}

interface EngineMachineContext {
  circuitOpenThreshold: number;
  connectionStatus: 'disconnected' | 'connecting' | 'connected' | 'degraded' | 'circuit_open';
  engineType: string;
  eventBus?: EngineMachineInput['eventBus'];
  failureCount: number;
  now: () => string;
  source: string;
  version?: string;
}

export type EngineMachineEvent =
  | { type: 'CONNECT'; version: string }
  | { type: 'DISCONNECT'; reason: string }
  | { type: 'HEARTBEAT_TIMEOUT' }
  | { type: 'PARSE_ERROR' }
  | { type: 'RECOVER' };

function publishSystemEvent(
  context: EngineMachineContext,
  event: Omit<SystemHealthEvent, 'revision'>,
): void {
  context.eventBus?.publish(event);
}

export const engineMachine = setup({
  actions: {
    incrementFailure: assign({
      failureCount: ({ context }) => context.failureCount + 1,
    }),
    publishCircuitBreak: ({ context }) => {
      publishSystemEvent(context, {
        engineType: context.engineType,
        event: 'circuit_break',
        failureCount: context.failureCount,
        runId: 'system',
        source: context.source,
        timestamp: context.now(),
      });
    },
    publishConnect: ({ context, event }) => {
      if (event.type !== 'CONNECT') {
        return;
      }
      publishSystemEvent(context, {
        engineType: context.engineType,
        event: 'engine_connect',
        runId: 'system',
        source: context.source,
        timestamp: context.now(),
        version: event.version,
      });
    },
    publishDisconnect: ({ context, event }) => {
      if (event.type !== 'DISCONNECT' && event.type !== 'HEARTBEAT_TIMEOUT') {
        return;
      }
      publishSystemEvent(context, {
        engineType: context.engineType,
        event: 'engine_disconnect',
        reason: event.type === 'DISCONNECT' ? event.reason : 'heartbeat_timeout',
        runId: 'system',
        source: context.source,
        timestamp: context.now(),
      });
    },
    resetFailure: assign({
      failureCount: () => 0,
    }),
    setCircuitOpen: assign({
      connectionStatus: () => 'circuit_open' as const,
    }),
    setConnected: assign({
      connectionStatus: () => 'connected' as const,
      version: ({ context, event }) => (event.type === 'CONNECT' ? event.version : context.version),
    }),
    setConnecting: assign({
      connectionStatus: () => 'connecting' as const,
      version: ({ context, event }) => (event.type === 'CONNECT' ? event.version : context.version),
    }),
    setDegraded: assign({
      connectionStatus: () => 'degraded' as const,
    }),
    setDisconnected: assign({
      connectionStatus: () => 'disconnected' as const,
    }),
  },
  guards: {
    shouldOpenCircuit: ({ context }) => context.failureCount + 1 >= context.circuitOpenThreshold,
  },
  types: {
    context: {} as EngineMachineContext,
    events: {} as EngineMachineEvent,
    input: {} as EngineMachineInput,
  },
}).createMachine({
  /*
   * Transition table
   * disconnected -> CONNECT -> connecting
   * connecting -> always -> connected
   * connected -> DISCONNECT|HEARTBEAT_TIMEOUT -> disconnected
   * connected -> PARSE_ERROR -> degraded
   * degraded -> CONNECT -> connecting
   * degraded -> RECOVER -> connected
   * degraded -> DISCONNECT|HEARTBEAT_TIMEOUT -> disconnected
   * degraded -> PARSE_ERROR[threshold] -> circuit_open
   * circuit_open -> CONNECT -> connecting
   */
  context: ({ input }) => ({
    circuitOpenThreshold: input.circuitOpenThreshold ?? 5,
    connectionStatus: 'disconnected',
    engineType: input.engineType,
    eventBus: input.eventBus,
    failureCount: 0,
    now: input.now ?? (() => new Date().toISOString()),
    source: input.source ?? 'core.engine-machine',
  }),
  id: 'engine-machine',
  initial: 'disconnected',
  states: {
    circuit_open: {
      on: {
        CONNECT: {
          actions: ['setConnecting'],
          target: 'connecting',
        },
      },
    },
    connected: {
      on: {
        DISCONNECT: {
          actions: ['setDisconnected', 'publishDisconnect', 'resetFailure'],
          target: 'disconnected',
        },
        HEARTBEAT_TIMEOUT: {
          actions: ['setDisconnected', 'publishDisconnect', 'resetFailure'],
          target: 'disconnected',
        },
        PARSE_ERROR: {
          actions: ['incrementFailure', 'setDegraded'],
          target: 'degraded',
        },
      },
    },
    connecting: {
      always: {
        actions: ['setConnected', 'publishConnect', 'resetFailure'],
        target: 'connected',
      },
    },
    degraded: {
      on: {
        CONNECT: {
          actions: ['setConnecting'],
          target: 'connecting',
        },
        DISCONNECT: {
          actions: ['setDisconnected', 'publishDisconnect', 'resetFailure'],
          target: 'disconnected',
        },
        HEARTBEAT_TIMEOUT: {
          actions: ['setDisconnected', 'publishDisconnect', 'resetFailure'],
          target: 'disconnected',
        },
        PARSE_ERROR: [
          {
            actions: ['incrementFailure', 'setCircuitOpen', 'publishCircuitBreak'],
            guard: 'shouldOpenCircuit',
            target: 'circuit_open',
          },
          {
            actions: ['incrementFailure'],
          },
        ],
        RECOVER: {
          actions: ['setConnected', 'resetFailure'],
          target: 'connected',
        },
      },
    },
    disconnected: {
      on: {
        CONNECT: {
          actions: ['setConnecting'],
          target: 'connecting',
        },
      },
    },
  },
});

export type EngineActor = ActorRefFrom<typeof engineMachine>;

export function createEngineActor(input: EngineMachineInput): EngineActor {
  return createActor(engineMachine, { input });
}
