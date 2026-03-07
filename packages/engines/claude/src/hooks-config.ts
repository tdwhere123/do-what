import fs from 'node:fs';
import path from 'node:path';

export interface ClaudeHookCommand {
  command: string;
  env: Record<string, string>;
  on_error: 'allow';
  timeout_ms: number;
}

export interface ClaudeHooksConfig {
  hooks: {
    PostToolUse: readonly ClaudeHookCommand[];
    PreToolUse: readonly ClaudeHookCommand[];
    Stop: readonly ClaudeHookCommand[];
  };
}

export interface GenerateHooksConfigOptions {
  hookRunnerPath: string;
  policyCachePath?: string;
  port: number;
  runId?: string;
  token: string;
  workspaceRoot?: string;
}

function quoteCommand(value: string): string {
  return process.platform === 'win32' && /\s/.test(value) ? `"${value}"` : value;
}

function createHookCommand(options: GenerateHooksConfigOptions): ClaudeHookCommand {
  return {
    command: `node ${quoteCommand(options.hookRunnerPath)}`,
    env: {
      DOWHAT_HOOK_SOURCE: 'engine.claude.hook-runner',
      DOWHAT_POLICY_CACHE_PATH: options.policyCachePath ?? '',
      DOWHAT_PORT: String(options.port),
      DOWHAT_RUN_ID: options.runId ?? '',
      DOWHAT_TOKEN: options.token,
      DOWHAT_WORKSPACE_ROOT: options.workspaceRoot ?? '',
    },
    on_error: 'allow',
    timeout_ms: 200,
  };
}

export function generateHooksConfig(
  options: GenerateHooksConfigOptions,
): ClaudeHooksConfig {
  const command = createHookCommand(options);
  return {
    hooks: {
      PostToolUse: [command],
      PreToolUse: [command],
      Stop: [command],
    },
  };
}

export function writeHooksConfig(
  configPath: string,
  config: ClaudeHooksConfig,
): string {
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
  return configPath;
}
