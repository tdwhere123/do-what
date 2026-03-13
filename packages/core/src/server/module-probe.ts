import { spawnSync } from 'node:child_process';
import type { ModuleHotState, ModulesHotState, ModuleStatus } from '@do-what/protocol';

interface CommandResult {
  readonly error?: string;
  readonly exitCode: number | null;
  readonly stderr: string;
  readonly stdout: string;
}

interface ProbeCliModuleInput {
  readonly command: string;
  readonly disabled: boolean;
  readonly label: string;
  readonly moduleId: string;
  readonly now: string;
  readonly runCommand?: (command: string, args: readonly string[]) => CommandResult;
}

const AUTH_FAILURE_PATTERN = /auth|login|token|apikey|api key|unauthorized|forbidden/i;
const NOT_INSTALLED_PATTERN = /not recognized|not found|enoent|cannot find/i;

function createModuleState(input: {
  readonly label: string;
  readonly meta?: Readonly<Record<string, unknown>>;
  readonly moduleId: string;
  readonly now: string;
  readonly phase: ModuleHotState['phase'];
  readonly reason?: string;
  readonly status: ModuleStatus;
}): ModuleHotState {
  return {
    kind: input.moduleId === 'soul' ? 'soul' : input.moduleId === 'core' ? 'core' : 'engine',
    label: input.label,
    meta: input.meta,
    module_id: input.moduleId,
    phase: input.phase,
    reason: input.reason,
    status: input.status,
    updated_at: input.now,
  };
}

function readVersion(stdout: string, stderr: string): string | undefined {
  const match = `${stdout}\n${stderr}`.match(/\d+\.\d+(?:\.\d+)?/);
  return match?.[0];
}

function runCommand(command: string, args: readonly string[]): CommandResult {
  const result = spawnSync(command, [...args], {
    encoding: 'utf8',
    shell: process.platform === 'win32',
    timeout: 1_500,
  });
  return {
    error: result.error?.message,
    exitCode: typeof result.status === 'number' ? result.status : null,
    stderr: result.stderr ?? '',
    stdout: result.stdout ?? '',
  };
}

function classifyCommandFailure(result: CommandResult): ModuleStatus {
  const details = `${result.error ?? ''}\n${result.stderr}\n${result.stdout}`;
  if (NOT_INSTALLED_PATTERN.test(details)) {
    return 'not_installed';
  }
  if (AUTH_FAILURE_PATTERN.test(details)) {
    return 'auth_failed';
  }
  return 'probe_failed';
}

function readFailureReason(result: CommandResult): string {
  const reason = result.error ?? result.stderr;
  return reason.length > 0 ? reason : 'probe failed';
}

export function probeCliModule(input: ProbeCliModuleInput): ModuleHotState {
  if (input.disabled) {
    return createModuleState({
      label: input.label,
      moduleId: input.moduleId,
      now: input.now,
      phase: 'ready',
      reason: 'disabled by environment',
      status: 'disabled',
    });
  }

  const result = (input.runCommand ?? runCommand)(input.command, ['--version']);
  if (result.exitCode === 0) {
    return createModuleState({
      label: input.label,
      meta: { version: readVersion(result.stdout, result.stderr) ?? 'unknown' },
      moduleId: input.moduleId,
      now: input.now,
      phase: 'ready',
      status: 'connected',
    });
  }

  return createModuleState({
    label: input.label,
    moduleId: input.moduleId,
    now: input.now,
    phase: 'degraded',
    reason: readFailureReason(result),
    status: classifyCommandFailure(result),
  });
}

export function createProbedModules(input: {
  readonly now?: () => string;
  readonly runCommand?: ProbeCliModuleInput['runCommand'];
  readonly soulReady: boolean;
}): ModulesHotState {
  const now = input.now?.() ?? new Date().toISOString();

  return {
    core: createModuleState({
      label: 'Core',
      moduleId: 'core',
      now,
      phase: 'ready',
      status: 'connected',
    }),
    engines: {
      claude: probeCliModule({
        command: 'claude',
        disabled: process.env.DOWHAT_DISABLE_CLAUDE === '1',
        label: 'Claude',
        moduleId: 'claude',
        now,
        runCommand: input.runCommand,
      }),
      codex: probeCliModule({
        command: 'codex',
        disabled: process.env.DOWHAT_DISABLE_CODEX === '1',
        label: 'Codex',
        moduleId: 'codex',
        now,
        runCommand: input.runCommand,
      }),
    },
    soul: createModuleState({
      label: 'Soul',
      moduleId: 'soul',
      now,
      phase: input.soulReady ? 'ready' : 'degraded',
      reason: input.soulReady ? undefined : 'soul dispatcher unavailable',
      status: input.soulReady ? 'connected' : 'probe_failed',
    }),
  };
}
