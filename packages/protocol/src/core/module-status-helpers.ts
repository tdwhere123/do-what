import type { ModulePhase, ModuleStatus } from './module-status.js';
import type {
  ModuleStatusSnapshot,
  WorkbenchHealthSnapshot,
  WorkbenchModulesSnapshot,
} from './ui-contract.js';

interface ModuleHealthInput {
  readonly phase: ModulePhase;
  readonly status: ModuleStatus;
}

export function deriveHealthStatusFromModule(
  module: ModuleHealthInput,
): WorkbenchHealthSnapshot['core'] {
  if (module.status === 'disconnected') {
    return 'offline';
  }

  if (module.phase === 'probing') {
    return 'booting';
  }

  if (module.phase === 'degraded') {
    return 'degraded';
  }

  return module.status === 'connected' ? 'healthy' : 'degraded';
}

function deriveEngineHealth(
  module: ModuleStatusSnapshot,
): WorkbenchHealthSnapshot['claude'] {
  return deriveHealthStatusFromModule(module);
}

export function deriveWorkbenchHealthSnapshot(
  modules: WorkbenchModulesSnapshot,
): WorkbenchHealthSnapshot {
  return {
    claude: deriveEngineHealth(modules.engines.claude),
    codex: deriveEngineHealth(modules.engines.codex),
    core: deriveHealthStatusFromModule(modules.core),
    network:
      modules.core.status === 'disconnected'
        ? 'offline'
        : modules.core.phase === 'probing'
          ? 'booting'
          : 'healthy',
    soul: deriveHealthStatusFromModule(modules.soul),
  };
}
