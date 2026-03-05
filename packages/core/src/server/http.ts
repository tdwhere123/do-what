import Fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify';
import path from 'node:path';
import {
  HOST,
  PORT,
  SESSION_TOKEN_PATH,
  STATE_DIR,
  ensureRuntimeDirs,
} from '../config.js';
import { WorkerClient } from '../db/worker-client.js';
import { ApprovalMachineController } from '../machines/approval-machine.js';
import { PolicyEngine } from '../policy/policy-engine.js';
import { authMiddleware, generateAndSaveToken } from './auth.js';
import { registerRoutes } from './routes.js';
import { SseManager } from './sse.js';

export interface StartHttpServerOptions {
  host?: string;
  isDevelopment?: boolean;
  logger?: FastifyServerOptions['logger'];
  policyCachePath?: string;
  policyPath?: string;
  port?: number;
  runDir?: string;
  sessionTokenPath?: string;
  stateDir?: string;
  skipSignalHandlers?: boolean;
  workspaceRoot?: string;
}

export interface HttpServerHandle {
  app: FastifyInstance;
  host: string;
  port: number;
  sseManager: SseManager;
  stop: () => Promise<void>;
  token: string;
}

function resolveBoundPort(app: FastifyInstance): number {
  const address = app.server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Unable to resolve bound HTTP port');
  }

  return address.port;
}

export async function startHttpServer(
  options: StartHttpServerOptions = {},
): Promise<HttpServerHandle> {
  const tokenPath = options.sessionTokenPath ?? SESSION_TOKEN_PATH;
  const runDir = options.runDir ?? path.dirname(tokenPath);
  const stateDir = options.stateDir ?? STATE_DIR;
  const workspaceRoot = options.workspaceRoot ?? process.cwd();
  const policyPath = options.policyPath ?? path.join(path.dirname(runDir), 'policy.json');
  const policyCachePath =
    options.policyCachePath ?? path.join(runDir, 'hook-policy-cache.json');
  ensureRuntimeDirs({
    runDir,
    stateDir,
  });

  const token = generateAndSaveToken(tokenPath);
  const workerClient = new WorkerClient(path.join(stateDir, 'state.db'));
  const approvalMachine = new ApprovalMachineController({
    dbWriter: workerClient,
  });
  const policyEngine = new PolicyEngine({
    approvalMachine,
    cachePath: policyCachePath,
    policyPath,
    workspaceRoot,
  });
  policyEngine.load();

  const sseManager = new SseManager();
  const app = Fastify({ logger: options.logger ?? true });
  const host = options.host ?? HOST;
  const requestedPort = options.port ?? PORT;
  const isDevelopment =
    options.isDevelopment ?? process.env.NODE_ENV === 'development';

  app.addHook(
    'onRequest',
    authMiddleware({
      skipPaths: new Set(['/health']),
      token,
    }),
  );

  registerRoutes(app, { isDevelopment, sseManager });

  await app.listen({ host, port: requestedPort });

  let stopping = false;
  const stop = async () => {
    if (stopping) {
      return;
    }
    stopping = true;

    policyEngine.stop();
    approvalMachine.stop();
    await workerClient.close();
    sseManager.closeAll();
    await app.close();
  };

  if (!options.skipSignalHandlers) {
    const shutdown = (signal: NodeJS.Signals) => {
      app.log.info({ signal }, 'received shutdown signal');
      void stop().finally(() => {
        process.exit(0);
      });
    };

    process.once('SIGINT', () => shutdown('SIGINT'));
    process.once('SIGTERM', () => shutdown('SIGTERM'));
  }

  return {
    app,
    host,
    port: resolveBoundPort(app),
    sseManager,
    stop,
    token,
  };
}
