import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { FastifyReply, FastifyRequest } from 'fastify';

const BEARER_PREFIX = 'Bearer ';

export function generateAndSaveToken(sessionTokenPath: string): string {
  const token = crypto.randomBytes(32).toString('hex');

  fs.mkdirSync(path.dirname(sessionTokenPath), { recursive: true });
  fs.writeFileSync(sessionTokenPath, token, 'utf8');

  try {
    fs.chmodSync(sessionTokenPath, 0o600);
  } catch (error) {
    console.warn(
      `[core] failed to set permissions for session token at ${sessionTokenPath}:`,
      error,
    );
  }

  return token;
}

export function loadToken(sessionTokenPath: string): string {
  return fs.readFileSync(sessionTokenPath, 'utf8').trim();
}

export interface AuthMiddlewareOptions {
  token: string;
  skipPaths?: Set<string>;
}

export function authMiddleware(options: AuthMiddlewareOptions) {
  const skipPaths = options.skipPaths ?? new Set<string>();

  return async function onRequest(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const pathname = request.raw.url?.split('?')[0] ?? request.url;
    if (skipPaths.has(pathname)) {
      return;
    }

    const authorizationHeader = request.headers.authorization;
    if (
      typeof authorizationHeader === 'string' &&
      authorizationHeader.startsWith(BEARER_PREFIX)
    ) {
      const providedToken = authorizationHeader.slice(BEARER_PREFIX.length).trim();
      if (providedToken.length > 0 && providedToken === options.token) {
        return;
      }
    }

    request.log.warn(
      {
        method: request.method,
        pathname,
        remoteAddress: request.ip,
      },
      'unauthorized request',
    );

    await reply.code(401).send({ error: 'Unauthorized' });
  };
}
