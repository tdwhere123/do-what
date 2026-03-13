import { describe, expect, it, vi } from 'vitest';
import type { RuntimeCoreConfig } from '../runtime/runtime-config';
import { HttpCoreEventSource } from './http-core-event-source';

function createConfig(overrides: Partial<RuntimeCoreConfig> = {}): RuntimeCoreConfig {
  return {
    baseUrl: 'http://127.0.0.1:3847',
    mockScenario: 'active',
    readFreshSessionToken: null,
    reconnectDelayMs: 25,
    sessionToken: null,
    transportMode: 'http',
    ...overrides,
  };
}

describe('http core event source', () => {
  it('reads the latest session token when opening the stream', async () => {
    const connectionStates: string[] = [];
    const readFreshSessionToken = vi.fn(() => 'fresh-token');
    let capturedHeaders: Headers | null = null;

    const fetchMock = vi.fn(
      (_input: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          capturedHeaders = new Headers(init?.headers);
          init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
        }),
    );

    const eventSource = new HttpCoreEventSource(
      createConfig({
        readFreshSessionToken,
      }),
      fetchMock as typeof fetch,
    );

    const stop = eventSource.start({
      onConnectionStateChange: (state) => {
        connectionStates.push(state);
      },
      onEnvelope: vi.fn(),
      onError: vi.fn(),
    });

    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(capturedHeaders).not.toBeNull();
    });

    const headers = capturedHeaders ?? new Headers();
    expect(headers.get('Authorization')).toBe('Bearer fresh-token');
    expect(readFreshSessionToken).toHaveBeenCalledTimes(1);

    stop();

    await vi.waitFor(() => {
      expect(connectionStates.at(-1)).toBe('disconnected');
    });
  });
});
