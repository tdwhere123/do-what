import type { SoulToolDispatcher } from '@do-what/soul';
import type { ProjectionManager } from '../projection/index.js';
import type { FastifyInstance } from 'fastify';

export interface RegisterSoulRoutesOptions {
  projectionManager: ProjectionManager;
  toolDispatcher: SoulToolDispatcher;
}

export function registerSoulRoutes(
  app: FastifyInstance,
  options: RegisterSoulRoutesOptions,
): void {
  app.get('/soul/proposals', async (request) => {
    const query = request.query as { project_id?: unknown };
    const projectId = typeof query.project_id === 'string' ? query.project_id : undefined;
    const projection = await options.projectionManager.get<
      readonly Record<string, unknown>[]
    >('pending_soul_proposals', projectId ?? '*');
    return {
      proposals: projection.data,
    };
  });

  app.get('/soul/healing/stats', async () => {
    const projection = await options.projectionManager.get<Record<string, unknown>>(
      'healing_stats_view',
      'global',
    );
    return projection.data;
  });
}
