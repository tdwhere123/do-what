import type { ToolExecutionEvent } from '@do-what/protocol';

export interface ToolEventForwarder {
  forward: (event: ToolExecutionEvent) => Promise<void>;
}

export interface CoreForwarderOptions {
  baseUrl?: string;
  endpoint?: string;
  port?: number;
  token?: string;
  timeoutMs?: number;
}

export interface ResolvedCoreForwarderOptions {
  baseUrl: string;
  endpoint: string;
  timeoutMs: number;
  token: string;
}

const DEFAULT_ENDPOINT = '/internal/hook-event';
const DEFAULT_TIMEOUT_MS = 1_000;

function resolveBaseUrl(options: CoreForwarderOptions): string | null {
  if (options.baseUrl) {
    return options.baseUrl;
  }

  const port = options.port ?? (process.env.DOWHAT_PORT ? Number(process.env.DOWHAT_PORT) : null);
  if (!port) {
    return null;
  }

  return `http://127.0.0.1:${port}`;
}

export function resolveCoreForwarderOptions(
  options: CoreForwarderOptions = {},
): ResolvedCoreForwarderOptions | null {
  const baseUrl = resolveBaseUrl(options);
  const token = options.token ?? process.env.DOWHAT_TOKEN;
  if (!baseUrl || !token) {
    return null;
  }

  return {
    baseUrl,
    endpoint: options.endpoint ?? DEFAULT_ENDPOINT,
    timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    token,
  };
}

export async function forwardToolEventToCore(
  event: ToolExecutionEvent,
  options: CoreForwarderOptions = {},
): Promise<void> {
  const resolved = resolveCoreForwarderOptions(options);
  if (!resolved) {
    return;
  }

  try {
    const response = await fetch(`${resolved.baseUrl}${resolved.endpoint}`, {
      body: JSON.stringify(event),
      headers: {
        Authorization: `Bearer ${resolved.token}`,
        'Content-Type': 'application/json',
      },
      method: 'POST',
      signal: AbortSignal.timeout(resolved.timeoutMs),
    });

    if (!response.ok) {
      console.warn('[claude][forwarder] failed to forward tool event', {
        endpoint: resolved.endpoint,
        status: response.status,
      });
    }
  } catch (error) {
    console.warn('[claude][forwarder] failed to reach core', error);
  }
}

export function createCoreToolEventForwarder(
  options: CoreForwarderOptions = {},
): ToolEventForwarder {
  return {
    forward: async (event) => {
      await forwardToolEventToCore(event, options);
    },
  };
}

export function createConfiguredCoreToolEventForwarder(
  options: CoreForwarderOptions = {},
): ToolEventForwarder | undefined {
  return resolveCoreForwarderOptions(options)
    ? createCoreToolEventForwarder(options)
    : undefined;
}
