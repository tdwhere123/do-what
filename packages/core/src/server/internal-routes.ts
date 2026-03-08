import { ToolExecutionEventSchema } from '@do-what/protocol';
import type { FastifyInstance } from 'fastify';
import type { EventDispatcher } from '../event-handler/index.js';
import { getBearerToken, isLoopbackAddress } from './loopback-auth.js';

export interface RegisterInternalRoutesOptions {
  eventDispatcher: EventDispatcher;
  token: string;
}

export function registerInternalRoutes(
  app: FastifyInstance,
  options: RegisterInternalRoutesOptions,
): void {
  app.post('/internal/hook-event', async (request, reply) => {
    if (!isLoopbackAddress(request.ip)) {
      await reply.code(403).send({ error: 'Forbidden' });
      return;
    }

    const providedToken = getBearerToken(request.headers.authorization);
    if (providedToken !== options.token) {
      await reply.code(401).send({ error: 'Unauthorized' });
      return;
    }

    const payload =
      request.body && typeof request.body === 'object' ? { ...request.body } : null;
    if (!payload) {
      await reply.code(400).send({ error: 'Invalid event payload' });
      return;
    }

    const parsed = ToolExecutionEventSchema.safeParse({
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
    const { ack, event } = options.eventDispatcher.dispatch(eventWithoutRevision);
    await reply.code(200).send({
      ackId: ack.ack_id,
      ok: true,
      revision: event.revision,
    });
  });
}
