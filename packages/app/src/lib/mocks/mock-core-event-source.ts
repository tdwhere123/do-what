import type { CoreSseEnvelope } from '@do-what/protocol';
import { ACTIVE_EVENT_FIXTURES, CORE_RESTART_EVENT_FIXTURE } from '../../test/fixtures';
import type { CoreEventSource, CoreEventSourceHandlers } from '../core-event-client/core-event-source';
import type { MockScenarioName } from './mock-core-api-adapter';

export interface MockCoreEventSourceOptions {
  readonly events?: readonly CoreSseEnvelope[];
  readonly includeCoreRestart?: boolean;
  readonly intervalMs?: number;
  readonly scenario?: MockScenarioName;
}

function getScenarioEvents(scenario: MockScenarioName): readonly CoreSseEnvelope[] {
  return scenario === 'empty' ? [] : ACTIVE_EVENT_FIXTURES;
}

export class MockCoreEventSource implements CoreEventSource {
  private readonly events: readonly CoreSseEnvelope[];
  private readonly includeCoreRestart: boolean;
  private readonly intervalMs: number;

  constructor(options: MockCoreEventSourceOptions = {}) {
    this.events = options.events ?? getScenarioEvents(options.scenario ?? 'active');
    this.includeCoreRestart = options.includeCoreRestart ?? options.scenario === 'desynced';
    this.intervalMs = options.intervalMs ?? 15;
  }

  start(handlers: CoreEventSourceHandlers): () => void {
    const timers: Array<ReturnType<typeof setTimeout>> = [];
    handlers.onConnectionStateChange('connecting');

    timers.push(
      setTimeout(() => {
        handlers.onConnectionStateChange('connected');

        this.events.forEach((event, index) => {
          timers.push(
            setTimeout(() => {
              handlers.onEnvelope(event);
            }, this.intervalMs * (index + 1)),
          );
        });

        if (this.includeCoreRestart) {
          timers.push(
            setTimeout(() => {
              handlers.onEnvelope(CORE_RESTART_EVENT_FIXTURE);
            }, this.intervalMs * (this.events.length + 1)),
          );
        }
      }, 0),
    );

    return () => {
      timers.forEach((timer) => clearTimeout(timer));
      handlers.onConnectionStateChange('disconnected');
    };
  }
}
