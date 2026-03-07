import http, {
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ToolsApiJsonSchemas,
  type ToolsApiName,
} from '@do-what/protocol';
import {
  createCoreToolEventForwarder,
  type ToolEventForwarder,
} from './core-forwarder.js';
import {
  HookPolicyCache,
  getDefaultHookPolicyCachePath,
} from './policy-cache.js';
import {
  handleToolCall,
  type ToolApprovalClient,
  type ToolHandlerDependencies,
  type ToolLifecycleObserver,
} from './tool-handlers.js';

export interface McpServerOptions {
  approvalClient?: ToolApprovalClient;
  eventForwarder?: ToolEventForwarder;
  host?: string;
  observer?: ToolLifecycleObserver;
  policyCache?: HookPolicyCache;
  port?: number;
  runId?: string;
  source?: string;
  workspaceRoot?: string;
}

export interface ClaudeMcpServerHandle {
  host: string;
  port: number;
  stop: () => Promise<void>;
  url: string;
}

const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PORT = 3848;

function getResolvedPort(server: Server): number {
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Unable to resolve MCP server port');
  }
  return address.port;
}

function writeJson(
  response: ServerResponse,
  statusCode: number,
  body: Record<string, unknown>,
): void {
  response.writeHead(statusCode, {
    'Content-Type': 'application/json',
  });
  response.end(`${JSON.stringify(body)}\n`);
}

function readJsonBody(request: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let buffer = '';
    request.setEncoding('utf8');
    request.on('data', (chunk: string) => {
      buffer += chunk;
    });
    request.on('end', () => {
      try {
        resolve(buffer.trim().length > 0 ? JSON.parse(buffer) : {});
      } catch (error) {
        reject(error);
      }
    });
    request.on('error', reject);
  });
}

function buildToolList(): Array<Record<string, unknown>> {
  return (Object.keys(ToolsApiJsonSchemas) as ToolsApiName[]).map((toolName) => ({
    inputSchema: ToolsApiJsonSchemas[toolName],
    name: toolName,
  }));
}

export class PendingApprovalStore implements ToolApprovalClient {
  async requestApproval(request: {
    approvalId: string;
  }): Promise<{
    approvalId: string;
    approved: boolean;
    pending?: boolean;
    reason?: string;
    status: 'approved' | 'denied' | 'pending' | 'timeout';
  }> {
    return {
      approvalId: request.approvalId,
      approved: false,
      pending: true,
      status: 'pending',
    };
  }
}

export async function startMcpServer(
  options: McpServerOptions = {},
): Promise<ClaudeMcpServerHandle> {
  const host = options.host ?? DEFAULT_HOST;
  const port = options.port ?? DEFAULT_PORT;
  const cache =
    options.policyCache
    ?? new HookPolicyCache({
      cachePath: process.env.DOWHAT_POLICY_CACHE_PATH ?? getDefaultHookPolicyCachePath(),
      workspaceRoot: options.workspaceRoot ?? process.env.DOWHAT_WORKSPACE_ROOT,
    });
  cache.load();

  const dependencies: Omit<ToolHandlerDependencies, 'runId'> = {
    approvalClient: options.approvalClient ?? new PendingApprovalStore(),
    cache,
    eventForwarder: options.eventForwarder ?? createCoreToolEventForwarder(),
    observer: options.observer,
    source: options.source ?? 'engine.claude.mcp',
    workspaceRoot: options.workspaceRoot ?? process.env.DOWHAT_WORKSPACE_ROOT,
  };

  const server = http.createServer(async (request, response) => {
    if (request.method === 'GET' && request.url === '/tools') {
      writeJson(response, 200, { tools: buildToolList() });
      return;
    }

    if (request.method === 'POST' && request.url === '/call') {
      try {
        const payload = (await readJsonBody(request)) as {
          arguments?: unknown;
          name?: string;
          runId?: string;
        };
        if (!payload.name || !(payload.name in ToolsApiJsonSchemas)) {
          writeJson(response, 400, { error: 'Unknown tool' });
          return;
        }

        const result = await handleToolCall(payload.name as ToolsApiName, payload.arguments ?? {}, {
          ...dependencies,
          runId: payload.runId ?? options.runId ?? process.env.DOWHAT_RUN_ID ?? 'claude-mcp-run',
        });
        writeJson(response, result.httpStatus, {
          approvalId: result.approvalId,
          error: result.error,
          ok: result.ok,
          result: result.result,
          status: result.status,
        });
      } catch (error) {
        writeJson(response, 400, {
          error: error instanceof Error ? error.message : String(error),
          ok: false,
        });
      }
      return;
    }

    writeJson(response, 404, { error: 'Not found' });
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      server.off('error', reject);
      resolve();
    });
  });

  const resolvedPort = getResolvedPort(server);
  return {
    host,
    port: resolvedPort,
    stop: async () => {
      cache.stop();
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
    },
    url: `http://${host}:${resolvedPort}`,
  };
}

async function runAsCli(): Promise<void> {
  const handle = await startMcpServer({
    port: process.env.DOWHAT_MCP_PORT ? Number(process.env.DOWHAT_MCP_PORT) : DEFAULT_PORT,
    runId: process.env.DOWHAT_RUN_ID,
    workspaceRoot: process.env.DOWHAT_WORKSPACE_ROOT,
  });

  console.log(`[claude][mcp] listening on ${handle.url}`);
  const shutdown = () => {
    void handle.stop().finally(() => {
      process.exit(0);
    });
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}

const entryPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (entryPath === path.resolve(fileURLToPath(import.meta.url))) {
  void runAsCli().catch((error) => {
    console.error('[claude][mcp] failed to start', error);
    process.exit(1);
  });
}
