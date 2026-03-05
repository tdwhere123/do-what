import { BaseEventSchema } from '@do-what/protocol';
import type { FastifyInstance } from 'fastify';
import type { SseManager } from './sse.js';

export interface RegisterRoutesOptions {
  isDevelopment: boolean;
  sseManager: SseManager;
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
    // TODO(T008): return aggregated machine state + pending approvals snapshot.
    return {};
  });

  if (options.isDevelopment) {
    app.post('/_dev/publish', async (request, reply) => {
      const parsed = BaseEventSchema.safeParse(request.body);
      if (!parsed.success) {
        await reply.code(400).send({
          error: 'Invalid event payload',
          issues: parsed.error.issues,
        });
        return;
      }

      options.sseManager.broadcast(parsed.data);
      await reply.code(200).send({ ok: true });
    });
  }
}
