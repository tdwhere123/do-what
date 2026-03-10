import { describe, expect, it, vi } from 'vitest';
import { createCoreHttpClient, CoreHttpError, unwrapCoreResponse } from './core-http-client';

describe('core http client', () => {
  it('injects the bearer token into requests and unwraps ok/data responses', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) =>
      new Response(
        JSON.stringify({
          data: {
            revision: 1,
          },
          ok: true,
        }),
        {
          headers: {
            'Content-Type': 'application/json',
          },
          status: 200,
        },
      ),
    );
    const client = createCoreHttpClient({
      baseUrl: 'http://127.0.0.1:3847',
      fetchImpl: fetchMock as typeof fetch,
      sessionToken: 'token-123',
    });

    const payload = await client.get('/state');
    const headers = new Headers(fetchMock.mock.calls[0]?.[1]?.headers);

    expect(headers.get('Authorization')).toBe('Bearer token-123');
    expect(payload).toEqual({
      revision: 1,
    });
  });

  it('keeps current ok payloads intact and rejects normalized error envelopes', async () => {
    expect(
      unwrapCoreResponse({
        ackId: 'ack-1',
        ok: true,
      }),
    ).toEqual({
      ackId: 'ack-1',
      ok: true,
    });

    expect(() =>
      unwrapCoreResponse({
        error: {
          code: 'RUN_NOT_FOUND',
          message: 'Run not found',
        },
        ok: false,
      }),
    ).toThrow(CoreHttpError);
  });

  it('raises a unified CoreHttpError for non-2xx responses', async () => {
    const client = createCoreHttpClient({
      baseUrl: 'http://127.0.0.1:3847',
      fetchImpl: vi.fn(async () =>
        new Response(JSON.stringify({ error: 'Ack not found' }), {
          headers: {
            'Content-Type': 'application/json',
          },
          status: 404,
        }),
      ) as typeof fetch,
    });

    await expect(client.get('/acks/missing')).rejects.toBeInstanceOf(CoreHttpError);
  });
});
