import type { CoreError } from '@do-what/protocol';
import { normalizeCoreError } from '../contracts';
import { createCoreAuthHeaders } from '../auth/core-auth';

export interface CoreHttpClientOptions {
  readonly baseUrl: string;
  readonly fetchImpl?: typeof fetch;
  readonly sessionToken?: string | null;
}

export class CoreHttpError extends Error {
  readonly coreError: CoreError;
  readonly status: number;

  constructor(coreError: CoreError, status: number) {
    super(coreError.message);
    this.coreError = coreError;
    this.name = 'CoreHttpError';
    this.status = status;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

async function readErrorPayload(response: Response): Promise<CoreError> {
  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    const payload = (await response.json()) as unknown;
    return normalizeCoreError(payload, `Core request failed with status ${response.status}`);
  }

  const message = await response.text();
  return normalizeCoreError(
    {
      error: message || `Core request failed with status ${response.status}`,
    },
    `Core request failed with status ${response.status}`,
  );
}

export function unwrapCoreResponse(payload: unknown): unknown {
  if (isRecord(payload) && payload.ok === false) {
    throw new CoreHttpError(normalizeCoreError(payload), 400);
  }

  if (isRecord(payload) && payload.ok === true && 'data' in payload) {
    return payload.data;
  }

  return payload;
}

export function buildCoreUrl(baseUrl: string, path: string): string {
  return new URL(path, baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`).toString();
}

export function createCoreHttpClient(options: CoreHttpClientOptions) {
  const fetchImpl = options.fetchImpl ?? fetch;

  async function request(
    path: string,
    init: RequestInit = {},
  ): Promise<unknown> {
    const headers = new Headers(init.headers ?? {});
    const authHeaders = createCoreAuthHeaders(options.sessionToken);
    if (authHeaders) {
      new Headers(authHeaders).forEach((value, key) => headers.set(key, value));
    }

    if (init.body && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }

    const response = await fetchImpl(buildCoreUrl(options.baseUrl, path), {
      ...init,
      headers,
    });

    if (!response.ok) {
      throw new CoreHttpError(await readErrorPayload(response), response.status);
    }

    if (response.status === 204) {
      return null;
    }

    const payload = (await response.json()) as unknown;
    return unwrapCoreResponse(payload);
  }

  return {
    get: (path: string, init?: RequestInit) => request(path, { ...init, method: 'GET' }),
    patch: (path: string, body: unknown, init?: RequestInit) =>
      request(path, {
        ...init,
        body: body === undefined ? undefined : JSON.stringify(body),
        method: 'PATCH',
      }),
    post: (path: string, body: unknown, init?: RequestInit) =>
      request(path, {
        ...init,
        body: body === undefined ? undefined : JSON.stringify(body),
        method: 'POST',
      }),
  };
}
