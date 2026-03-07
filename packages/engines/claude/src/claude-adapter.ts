import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createRunActor,
  type RunMachineInput,
  type RunActor,
} from '@do-what/core';
import { writeClaudeMdFile } from './claude-md-generator.js';
import { ClaudeProcess } from './claude-process.js';
import {
  createCoreToolEventForwarder,
  type ToolEventForwarder,
} from './core-forwarder.js';
import {
  generateHooksConfig,
  writeHooksConfig,
} from './hooks-config.js';
import {
  startMcpServer,
  type ClaudeMcpServerHandle,
} from './mcp-server.js';
import {
  HookPolicyCache,
  getDefaultHookPolicyCachePath,
} from './policy-cache.js';
import type { ToolApprovalClient } from './tool-handlers.js';

export interface StartClaudeRunOptions {
  agentId?: string;
  approvalClient?: ToolApprovalClient;
  claudeArgs?: string[];
  claudeCommand?: string;
  hookRunnerPath?: string;
  policyCachePath?: string;
  port?: number;
  prompt: string;
  runId: string;
  token?: string;
  workspaceId: string;
  workspaceRoot: string;
}

export interface ClaudeRunHandle {
  claudeMdPath: string;
  hooksConfigPath: string;
  mcpServer: ClaudeMcpServerHandle;
  process: ClaudeProcess;
  runActor: RunActor;
  stop: () => Promise<void>;
}

export interface ClaudeAdapterDependencies {
  createProcess?: (options: ConstructorParameters<typeof ClaudeProcess>[0]) => ClaudeProcess;
  createRunActor?: (input: RunMachineInput) => RunActor;
  startMcpServer?: typeof startMcpServer;
}

function buildHooksConfigPath(workspaceRoot: string): string {
  return path.join(workspaceRoot, '.dowhat', 'claude-hooks.json');
}

function buildHookRunnerArgs(options: {
  claudeMdPath: string;
  hooksConfigPath: string;
  mcpServerUrl?: string;
  prompt: string;
}): string[] {
  const args = [
    '--hooks-file',
    options.hooksConfigPath,
    '--system-prompt-file',
    options.claudeMdPath,
  ];
  if (options.mcpServerUrl) {
    args.push('--mcp-server', options.mcpServerUrl);
  }
  args.push(options.prompt);
  return args;
}

function createHookObserver(runActor: RunActor) {
  return {
    onFailed: (event: {
      reason: string;
      toolName: string;
    }) => {
      runActor.send({
        reason: event.reason,
        toolName: event.toolName,
        type: 'TOOL_FAILED',
      });
    },
    onRequest: (event: {
      approvalId: string;
      args: Readonly<Record<string, unknown>>;
      toolName: string;
    }) => {
      runActor.send({
        approvalId: event.approvalId,
        args: event.args,
        toolName: event.toolName,
        type: 'TOOL_REQUEST',
      });
    },
    onResolved: (event: {
      approvalId: string;
      approved: boolean;
      reason?: string;
    }) => {
      runActor.send({
        approvalId: event.approvalId,
        approved: event.approved,
        reason: event.reason,
        type: 'TOOL_RESOLVED',
      });
    },
  };
}

export function getDefaultHookRunnerPath(): string {
  return path.join(path.dirname(fileURLToPath(import.meta.url)), 'hook-runner.js');
}

export class ClaudeAdapter {
  private readonly dependencies: ClaudeAdapterDependencies;

  constructor(dependencies: ClaudeAdapterDependencies = {}) {
    this.dependencies = dependencies;
  }

  async startRun(options: StartClaudeRunOptions): Promise<ClaudeRunHandle> {
    const policyCache = new HookPolicyCache({
      cachePath: options.policyCachePath ?? getDefaultHookPolicyCachePath(),
      workspaceRoot: options.workspaceRoot,
    });
    policyCache.load();

    const createRunActorFn = this.dependencies.createRunActor ?? createRunActor;
    const runActor = createRunActorFn({
      agentId: options.agentId,
      engineType: 'claude',
      policyEvaluate: (toolName, args) => policyCache.evaluate(toolName, args, options.workspaceRoot),
      runId: options.runId,
      workspaceId: options.workspaceId,
    });
    runActor.start();
    runActor.send({ type: 'START' });

    const eventForwarder: ToolEventForwarder | undefined = options.token
      ? createCoreToolEventForwarder({
        port: options.port,
        token: options.token,
      })
      : undefined;
    const startMcpServerFn = this.dependencies.startMcpServer ?? startMcpServer;
    const mcpServer = await startMcpServerFn({
      approvalClient: options.approvalClient,
      eventForwarder,
      observer: createHookObserver(runActor),
      runId: options.runId,
      workspaceRoot: options.workspaceRoot,
    });

    const claudeMdPath = writeClaudeMdFile(options.workspaceRoot);
    const hooksConfigPath = writeHooksConfig(
      buildHooksConfigPath(options.workspaceRoot),
      generateHooksConfig({
        hookRunnerPath: options.hookRunnerPath ?? getDefaultHookRunnerPath(),
        policyCachePath: options.policyCachePath ?? getDefaultHookPolicyCachePath(),
        port: options.port ?? 3847,
        runId: options.runId,
        token: options.token ?? '',
        workspaceRoot: options.workspaceRoot,
      }),
    );

    const createProcess = this.dependencies.createProcess ?? ((processOptions) => new ClaudeProcess(processOptions));
    const claudeProcess = createProcess({
      args: [
        ...buildHookRunnerArgs({
          claudeMdPath,
          hooksConfigPath,
          mcpServerUrl: mcpServer.url,
          prompt: options.prompt,
        }),
        ...(options.claudeArgs ?? []),
      ],
      command: options.claudeCommand,
      cwd: options.workspaceRoot,
      env: {
        ...process.env,
        DOWHAT_MCP_PORT: String(mcpServer.port),
        DOWHAT_POLICY_CACHE_PATH: options.policyCachePath ?? getDefaultHookPolicyCachePath(),
        DOWHAT_PORT: String(options.port ?? 3847),
        DOWHAT_RUN_ID: options.runId,
        DOWHAT_TOKEN: options.token ?? '',
      },
      onExit: (code) => {
        if (code === 0) {
          runActor.send({ type: 'COMPLETE' });
          return;
        }
        runActor.send({
          error: `Claude exited with code ${code ?? -1}`,
          type: 'FAIL',
        });
      },
    });
    claudeProcess.start();

    return {
      claudeMdPath,
      hooksConfigPath,
      mcpServer,
      process: claudeProcess,
      runActor,
      stop: async () => {
        claudeProcess.stop();
        await mcpServer.stop();
        policyCache.stop();
      },
    };
  }
}
