import { AnyEventSchema } from '@do-what/protocol';
import type { FastifyInstance } from 'fastify';
import type { SoulToolDispatcher } from '@do-what/soul';
import type { StateStore } from '../db/state-store.js';
import type { EventDispatcher } from '../event-handler/index.js';
import type { ProjectionManager } from '../projection/index.js';
import type { AckTracker } from '../state/index.js';
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
  ackTracker: AckTracker;
  eventDispatcher: EventDispatcher;
  isDevelopment: boolean;
  mcpToolDispatcher: SoulToolDispatcher;
  projectionManager: ProjectionManager;
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

  app.get('/acks/:ackId', async (request, reply) => {
    const params = request.params as { ackId?: unknown };
    const ackId = typeof params.ackId === 'string' ? params.ackId : '';
    const ack = ackId ? options.ackTracker.get(ackId) : null;
    if (!ack) {
      await reply.code(404).send({ error: 'Ack not found' });
      return;
    }

    await reply.code(200).send({
      ok: true,
      ...ack,
    });
  });

  registerInternalRoutes(app, {
    eventDispatcher: options.eventDispatcher,
    token: options.token,
  });
  registerMcpRoutes(app, {
    token: options.token,
    toolDispatcher: options.mcpToolDispatcher,
  });
  registerSoulRoutes(app, {
    projectionManager: options.projectionManager,
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
      const { ack } = options.eventDispatcher.dispatch(eventWithoutRevision);
      await reply.code(200).send({
        ackId: ack.ack_id,
        ok: true,
      });
    });
  }
}
