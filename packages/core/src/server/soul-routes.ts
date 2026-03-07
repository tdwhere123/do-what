import type { SoulToolDispatcher } from '@do-what/soul';
import type { FastifyInstance } from 'fastify';

export interface RegisterSoulRoutesOptions {
  toolDispatcher: SoulToolDispatcher;
}

export function registerSoulRoutes(
  app: FastifyInstance,
  options: RegisterSoulRoutesOptions,
): void {
  app.get('/soul/proposals', async (request) => {
    const query = request.query as { project_id?: unknown };
    const projectId = typeof query.project_id === 'string' ? query.project_id : undefined;
    return {
      proposals: await options.toolDispatcher.listPendingProposals(projectId),
    };
  });

  app.get('/soul/healing/stats', async () => {
    return await options.toolDispatcher.getHealingStats();
  });
}
