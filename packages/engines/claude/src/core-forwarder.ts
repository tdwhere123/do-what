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

export async function forwardToolEventToCore(
  event: ToolExecutionEvent,
  options: CoreForwarderOptions = {},
): Promise<void> {
  const baseUrl = resolveBaseUrl(options);
  const token = options.token ?? process.env.DOWHAT_TOKEN;
  if (!baseUrl || !token) {
    return;
  }

  const endpoint = options.endpoint ?? '/internal/hook-event';
  try {
    const response = await fetch(`${baseUrl}${endpoint}`, {
      body: JSON.stringify(event),
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      method: 'POST',
      signal: AbortSignal.timeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS),
    });

    if (!response.ok) {
      console.warn('[claude][forwarder] failed to forward tool event', {
        endpoint,
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
