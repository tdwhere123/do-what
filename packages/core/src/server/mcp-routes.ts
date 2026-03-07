import {
  SoulToolValidationError,
  UnknownSoulToolError,
  type SoulToolCall,
  type SoulToolDispatcher,
} from '@do-what/soul';
import type { FastifyInstance } from 'fastify';
import { getBearerToken, isLoopbackAddress } from './loopback-auth.js';

export interface RegisterMcpRoutesOptions {
  token: string;
  toolDispatcher: SoulToolDispatcher;
}

function normalizeCall(body: unknown): SoulToolCall | null {
  if (!body || typeof body !== 'object') {
    return null;
  }

  const payload = body as Record<string, unknown>;
  const toolName =
    typeof payload.tool === 'string'
      ? payload.tool
      : typeof payload.name === 'string'
        ? payload.name
        : null;
  if (!toolName) {
    return null;
  }

  return {
    arguments:
      payload.args !== undefined
        ? payload.args
        : payload.arguments !== undefined
          ? payload.arguments
          : {},
    name: toolName,
  };
}

export function registerMcpRoutes(
  app: FastifyInstance,
  options: RegisterMcpRoutesOptions,
): void {
  app.post('/mcp/call', async (request, reply) => {
    if (!isLoopbackAddress(request.ip)) {
      await reply.code(403).send({ error: 'Forbidden' });
      return;
    }

    const providedToken = getBearerToken(request.headers.authorization);
    if (providedToken !== options.token) {
      await reply.code(401).send({ error: 'Unauthorized' });
      return;
    }

    const call = normalizeCall(request.body);
    if (!call) {
      await reply.code(400).send({ error: 'Invalid MCP call payload' });
      return;
    }

    if (!options.toolDispatcher.hasTool(call.name)) {
      await reply.code(404).send({
        error: `Unknown MCP tool: ${call.name}`,
        ok: false,
        status: 'not_found',
      });
      return;
    }

    try {
      const result = await options.toolDispatcher.dispatch(call);
      await reply.code(200).send({
        ok: true,
        result,
        status: 'completed',
      });
    } catch (error) {
      if (error instanceof SoulToolValidationError) {
        await reply.code(400).send({
          error: error.message,
          issues: error.issues,
          ok: false,
          status: 'invalid_request',
        });
        return;
      }

      if (error instanceof UnknownSoulToolError) {
        await reply.code(404).send({
          error: error.message,
          ok: false,
          status: 'not_found',
        });
        return;
      }

      request.log.error({ err: error }, 'mcp tool dispatch failed');
      await reply.code(500).send({
        error: 'MCP tool dispatch failed',
        ok: false,
        status: 'failed',
      });
    }
  });
}
