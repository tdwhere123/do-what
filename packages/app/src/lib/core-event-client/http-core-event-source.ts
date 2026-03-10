import { createCoreAuthHeaders } from '../auth/core-auth';
import { normalizeCoreError, normalizeCoreSseEnvelope } from '../contracts';
import { buildCoreUrl } from '../core-http-client/core-http-client';
import type { RuntimeCoreConfig } from '../runtime/runtime-config';
import type { CoreEventSource, CoreEventSourceHandlers } from './core-event-source';
import { readSseStream } from './sse-parser';

async function wait(delayMs: number): Promise<void> {
  if (delayMs <= 0) {
    return;
  }

  await new Promise((resolve) => setTimeout(resolve, delayMs));
}

export class HttpCoreEventSource implements CoreEventSource {
  private readonly config: RuntimeCoreConfig;
  private readonly fetchImpl: typeof fetch;

  constructor(config: RuntimeCoreConfig, fetchImpl: typeof fetch = fetch) {
    this.config = config;
    this.fetchImpl = fetchImpl;
  }

  start(handlers: CoreEventSourceHandlers): () => void {
    let activeAbortController: AbortController | null = null;
    let isStopped = false;
    let lastCoreSessionId: string | null = null;
    let hasConnected = false;

    const run = async () => {
      while (!isStopped) {
        handlers.onConnectionStateChange(hasConnected ? 'reconnecting' : 'connecting');
        activeAbortController = new AbortController();

        try {
          const response = await this.fetchImpl(buildCoreUrl(this.config.baseUrl, '/events'), {
            headers: createCoreAuthHeaders(this.config.sessionToken),
            signal: activeAbortController.signal,
          });

          if (!response.ok || !response.body) {
            throw new Error(`Event stream request failed with status ${response.status}`);
          }

          hasConnected = true;
          handlers.onConnectionStateChange('connected');

          await readSseStream(
            response.body,
            (frame) => {
              const payload = JSON.parse(frame.data) as unknown;
              const envelope = normalizeCoreSseEnvelope(payload, lastCoreSessionId);
              lastCoreSessionId = envelope.coreSessionId ?? lastCoreSessionId;
              handlers.onEnvelope(envelope);
            },
            activeAbortController.signal,
          );
        } catch (error) {
          if (isStopped || activeAbortController.signal.aborted) {
            break;
          }

          handlers.onError(
            normalizeCoreError(
              {
                error: error instanceof Error ? error.message : String(error),
              },
              'Core event stream failed',
            ),
          );
          handlers.onConnectionStateChange('reconnecting');
          await wait(this.config.reconnectDelayMs);
        }
      }

      handlers.onConnectionStateChange('disconnected');
    };

    void run();

    return () => {
      isStopped = true;
      activeAbortController?.abort();
    };
  }
}
