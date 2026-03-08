import { AnyEventSchema } from '@do-what/protocol';
import type { FastifyInstance } from 'fastify';
import type { SoulToolDispatcher } from '@do-what/soul';
import type { StateStore } from '../db/state-store.js';
import type { EventBus } from '../eventbus/event-bus.js';
import { registerInternalRoutes } from './internal-routes.js';
import { isLoopbackAddress } from './loopback-auth.js';
import { registerMcpRoutes } from './mcp-routes.js';
import { registerSoulRoutes } from './soul-routes.js';
import type { SseManager } from './sse.js';

export interface DevRunRequest {
  durationMs?: number;
  engine?: string;
  prompt?: string;
}

export interface DevRunResult {
  durationMs: number;
  runId: string;
  worktreePath: string;
}

export interface RegisterRoutesOptions {
  eventBus: EventBus;
  isDevelopment: boolean;
  mcpToolDispatcher: SoulToolDispatcher;
  startDevRun?: (input: DevRunRequest) => Promise<DevRunResult>;
  stateStore: StateStore;
  sseManager: SseManager;
  token: string;
}

export function registerRoutes(
  app: FastifyInstance,
  options: RegisterRoutesOptions,
): void {
  app.get('/health', async () => {
    return {
      ok: true,
      uptime: process.uptime(),
      version: process.env.npm_package_version ?? '0.1.0',
    };
  });

  app.get('/events', async (_request, reply) => {
    reply.hijack();
    options.sseManager.subscribe(reply.raw);
  });

  app.get('/state', async () => {
    // `/state` returns the current hot_state view from Core's read path.
    return options.stateStore.getSnapshot();
  });

  registerInternalRoutes(app, {
    eventBus: options.eventBus,
    token: options.token,
  });
  registerMcpRoutes(app, {
    token: options.token,
    toolDispatcher: options.mcpToolDispatcher,
  });
  registerSoulRoutes(app, {
    toolDispatcher: options.mcpToolDispatcher,
  });

  if (options.isDevelopment) {
    if (options.startDevRun) {
      const startDevRun = options.startDevRun;
      app.post('/_dev/start-run', async (request, reply) => {
        if (!isLoopbackAddress(request.ip)) {
          await reply.code(403).send({ error: 'Forbidden' });
          return;
        }

        const payload =
          request.body && typeof request.body === 'object'
            ? (request.body as DevRunRequest)
            : {};
        const result = await startDevRun(payload);
        await reply.code(202).send({
          ok: true,
          ...result,
        });
      });
    }

    app.post('/_dev/publish', async (request, reply) => {
      const payload =
        request.body && typeof request.body === 'object' ? { ...request.body } : null;
      if (!payload) {
        await reply.code(400).send({
          error: 'Invalid event payload',
        });
        return;
      }

      const parsed = AnyEventSchema.safeParse({
        ...payload,
        revision: 0,
      });
      if (!parsed.success) {
        await reply.code(400).send({
          error: 'Invalid event payload',
          issues: parsed.error.issues,
        });
        return;
      }

      const { revision: _revision, ...eventWithoutRevision } = parsed.data;
      options.eventBus.publish(eventWithoutRevision);
      await reply.code(200).send({ ok: true });
    });
  }
}
