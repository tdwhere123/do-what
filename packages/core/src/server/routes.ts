import {
  AnyEventSchema,
  ApprovalDecisionRequestSchema,
  CreateRunRequestSchema,
  DriftResolutionRequestSchema,
  IntegrationGateDecisionRequestSchema,
  MemoryEditRequestSchema,
  MemoryPinRequestSchema,
  MemoryProposalReviewRequestSchema,
  MemorySupersedeRequestSchema,
  RunMessageRequestSchema,
  SettingsPatchRequestSchema,
} from '@do-what/protocol';
import type { FastifyInstance, FastifyReply } from 'fastify';
import type { SoulToolDispatcher } from '@do-what/soul';
import { z } from 'zod';
import type { StateStore } from '../db/state-store.js';
import type { EventDispatcher } from '../event-handler/index.js';
import type { ProjectionManager } from '../projection/index.js';
import type { AckTracker } from '../state/index.js';
import { registerInternalRoutes } from './internal-routes.js';
import { isLoopbackAddress } from './loopback-auth.js';
import { registerMcpRoutes } from './mcp-routes.js';
import { registerSoulRoutes } from './soul-routes.js';
import type { SseManager } from './sse.js';
import { CoreApiError, type UiCommandService } from './ui-command-service.js';
import type { UiQueryService } from './ui-query-service.js';

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
  commandService: UiCommandService;
  coreSessionId: string;
  eventDispatcher: EventDispatcher;
  isDevelopment: boolean;
  mcpToolDispatcher: SoulToolDispatcher;
  projectionManager: ProjectionManager;
  queryService: UiQueryService;
  startDevRun?: (input: DevRunRequest) => Promise<DevRunResult>;
  stateStore: StateStore;
  sseManager: SseManager;
  token: string;
}

function asNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function readParams(request: { params: unknown }): Record<string, unknown> {
  return request.params && typeof request.params === 'object'
    ? (request.params as Record<string, unknown>)
    : {};
}

function readQuery(request: { query: unknown }): Record<string, unknown> {
  return request.query && typeof request.query === 'object'
    ? (request.query as Record<string, unknown>)
    : {};
}

function requireParam(
  request: { params: unknown },
  name: string,
): string {
  const value = readParams(request)[name];
  if (typeof value === 'string' && value.length > 0) {
    return value;
  }
  throw new CoreApiError({
    code: 'invalid_path_param',
    details: {
      name,
      value,
    },
    message: `Missing required path parameter: ${name}`,
    status: 400,
  });
}

function parseBody<Schema extends z.ZodTypeAny>(
  schema: Schema,
  body: unknown,
): z.output<Schema> {
  const parsed = schema.safeParse(body);
  if (parsed.success) {
    return parsed.data;
  }

  throw new CoreApiError({
    code: 'invalid_request_body',
    details: {
      issues: parsed.error.issues,
    },
    message: 'Request body did not match the expected schema.',
    status: 400,
  });
}

async function sendData(reply: FastifyReply, data: unknown, statusCode = 200): Promise<void> {
  await reply.code(statusCode).send({
    data,
    ok: true,
  });
}

async function sendError(reply: FastifyReply, error: unknown): Promise<void> {
  if (error instanceof CoreApiError) {
    await reply.code(error.status).send({
      error: {
        code: error.code,
        details: error.details,
        message: error.message,
      },
      ok: false,
    });
    return;
  }

  await reply.code(500).send({
    error: {
      code: 'internal_error',
      message: error instanceof Error ? error.message : String(error),
    },
    ok: false,
  });
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

  app.get('/api/events/stream', async (_request, reply) => {
    reply.hijack();
    options.sseManager.subscribe(reply.raw);
  });

  app.get('/state', async () => {
    return options.stateStore.getSnapshot();
  });

  app.get('/api/workbench/snapshot', async (_request, reply) => {
    try {
      await sendData(reply, options.queryService.getWorkbenchSnapshot());
    } catch (error) {
      await sendError(reply, error);
    }
  });

  app.get('/api/workflows/templates', async (_request, reply) => {
    try {
      await sendData(reply, options.queryService.listTemplates());
    } catch (error) {
      await sendError(reply, error);
    }
  });

  app.get('/api/runs/:runId/timeline', async (request, reply) => {
    try {
      const runId = requireParam(request, 'runId');
      const query = readQuery(request);
      await sendData(
        reply,
        options.queryService.getTimelinePage({
          beforeRevision: asNumber(query.beforeRevision) ?? null,
          limit: asNumber(query.limit),
          runId,
        }),
      );
    } catch (error) {
      await sendError(reply, error);
    }
  });

  app.get('/api/runs/:runId/inspector', async (request, reply) => {
    try {
      const runId = requireParam(request, 'runId');
      await sendData(reply, options.queryService.getInspectorSnapshot(runId));
    } catch (error) {
      await sendError(reply, error);
    }
  });

  app.get('/api/settings', async (_request, reply) => {
    try {
      await sendData(reply, options.queryService.getSettingsSnapshot());
    } catch (error) {
      await sendError(reply, error);
    }
  });

  app.get('/api/approvals/:approvalId', async (request, reply) => {
    try {
      const approvalId = requireParam(request, 'approvalId');
      const probe = options.queryService.getApprovalProbe(approvalId);
      if (!probe) {
        throw new CoreApiError({
          code: 'approval_not_found',
          message: `Unknown approval: ${approvalId}`,
          status: 404,
        });
      }
      await sendData(reply, probe);
    } catch (error) {
      await sendError(reply, error);
    }
  });

  app.get('/api/memory/:memoryId', async (request, reply) => {
    try {
      const memoryId = requireParam(request, 'memoryId');
      const probe = options.queryService.getMemoryProbe(memoryId);
      if (!probe) {
        throw new CoreApiError({
          code: 'memory_not_found',
          message: `Unknown memory: ${memoryId}`,
          status: 404,
        });
      }
      await sendData(reply, probe);
    } catch (error) {
      await sendError(reply, error);
    }
  });

  app.post('/api/runs', async (request, reply) => {
    try {
      const body = parseBody(CreateRunRequestSchema, request.body);
      await sendData(reply, await options.commandService.createRun(body), 202);
    } catch (error) {
      await sendError(reply, error);
    }
  });

  app.post('/api/runs/:runId/messages', async (request, reply) => {
    try {
      const runId = requireParam(request, 'runId');
      const body = parseBody(RunMessageRequestSchema, request.body);
      await sendData(
        reply,
        options.commandService.postRunMessage(runId, body.body, body.clientCommandId),
        202,
      );
    } catch (error) {
      await sendError(reply, error);
    }
  });

  app.post('/api/approvals/:approvalId/decide', async (request, reply) => {
    try {
      const approvalId = requireParam(request, 'approvalId');
      const body = parseBody(ApprovalDecisionRequestSchema, request.body);
      await sendData(reply, options.commandService.decideApproval(approvalId, body), 202);
    } catch (error) {
      await sendError(reply, error);
    }
  });

  app.post('/api/memory/proposals/:proposalId/review', async (request, reply) => {
    try {
      const proposalId = requireParam(request, 'proposalId');
      const body = parseBody(MemoryProposalReviewRequestSchema, request.body);
      await sendData(
        reply,
        await options.commandService.reviewMemoryProposal(proposalId, body),
        202,
      );
    } catch (error) {
      await sendError(reply, error);
    }
  });

  app.post('/api/memory/:memoryId/pin', async (request, reply) => {
    try {
      const memoryId = requireParam(request, 'memoryId');
      const body = parseBody(MemoryPinRequestSchema, request.body);
      await sendData(
        reply,
        options.commandService.rejectUnsupportedMemoryPin(memoryId, body),
        202,
      );
    } catch (error) {
      await sendError(reply, error);
    }
  });

  app.post('/api/memory/:memoryId/edit', async (request, reply) => {
    try {
      const memoryId = requireParam(request, 'memoryId');
      const body = parseBody(MemoryEditRequestSchema, request.body);
      await sendData(
        reply,
        options.commandService.rejectUnsupportedMemoryEdit(memoryId, body),
        202,
      );
    } catch (error) {
      await sendError(reply, error);
    }
  });

  app.post('/api/memory/:memoryId/supersede', async (request, reply) => {
    try {
      const memoryId = requireParam(request, 'memoryId');
      const body = parseBody(MemorySupersedeRequestSchema, request.body);
      await sendData(
        reply,
        options.commandService.rejectUnsupportedMemorySupersede(memoryId, body),
        202,
      );
    } catch (error) {
      await sendError(reply, error);
    }
  });

  app.post('/api/nodes/:nodeId/resolve-drift', async (request, reply) => {
    try {
      const nodeId = requireParam(request, 'nodeId');
      const body = parseBody(DriftResolutionRequestSchema, request.body);
      await sendData(
        reply,
        options.commandService.rejectUnsupportedDriftAction(nodeId, body),
        202,
      );
    } catch (error) {
      await sendError(reply, error);
    }
  });

  app.post('/api/runs/:runId/integration-gate/decide', async (request, reply) => {
    try {
      const runId = requireParam(request, 'runId');
      const body = parseBody(IntegrationGateDecisionRequestSchema, request.body);
      await sendData(
        reply,
        options.commandService.rejectUnsupportedGateAction(runId, body),
        202,
      );
    } catch (error) {
      await sendError(reply, error);
    }
  });

  app.patch('/api/settings', async (request, reply) => {
    try {
      const body = parseBody(SettingsPatchRequestSchema, request.body);
      await sendData(reply, await options.commandService.patchSettings(body), 202);
    } catch (error) {
      await sendError(reply, error);
    }
  });

  app.get('/acks/:ackId', async (request, reply) => {
    const ackId = requireParam(request, 'ackId');
    const ack = options.ackTracker.get(ackId);
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
