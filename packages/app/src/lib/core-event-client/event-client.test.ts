import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CoreSessionGuard } from '../core-session-guard';
import { NormalizedEventBus } from '../events';
import { MockCoreEventSource } from '../mocks';
import { ACTIVE_EVENT_FIXTURES, CORE_RESTART_EVENT_FIXTURE } from '../../test/fixtures';
import { createCoreEventClient } from './core-event-client';
import { extractSseFrames } from './sse-parser';

describe('event-client', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('parses SSE data frames without assuming EventSource support', () => {
    expect(
      extractSseFrames(': connected\n\ndata: {\"hello\":\"world\"}\n\n').frames,
    ).toEqual([
      {
        data: '{"hello":"world"}',
      },
    ]);
  });

  it('normalizes event delivery, connection state, and coreSessionId changes through one pipeline', () => {
    const eventBus = new NormalizedEventBus();
    const sessionGuard = new CoreSessionGuard();
    const messages: string[] = [];

    eventBus.subscribe((message) => {
      if (message.kind === 'connection') {
        messages.push(`connection:${message.state}`);
      }

      if (message.kind === 'event') {
        messages.push(`event:${message.event.type}:${message.event.revision}`);
      }

      if (message.kind === 'session') {
        messages.push(`session:${message.transition.type}:${message.transition.nextCoreSessionId}`);
      }
    });

    const client = createCoreEventClient({
      eventBus,
      eventSource: new MockCoreEventSource({
        events: [...ACTIVE_EVENT_FIXTURES, CORE_RESTART_EVENT_FIXTURE],
        intervalMs: 10,
      }),
      sessionGuard,
    });

    const stop = client.start();
    vi.runAllTimers();
    stop();

    expect(messages).toContain('connection:connecting');
    expect(messages).toContain('connection:connected');
    expect(messages.some((message) => message.startsWith('event:token_stream'))).toBe(true);
    expect(messages.some((message) => message.startsWith('session:initialized'))).toBe(true);
    expect(messages.some((message) => message.startsWith('session:changed'))).toBe(true);
  });
});
