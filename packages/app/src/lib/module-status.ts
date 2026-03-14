import type { ModuleStatusSnapshot, WorkbenchModulesSnapshot } from '@do-what/protocol';

type ModuleTone = 'attention' | 'ok' | 'running';

const ENGINE_PRIORITY: Record<ModuleStatusSnapshot['status'], number> = {
  auth_failed: 5,
  probe_failed: 4,
  not_installed: 3,
  disabled: 2,
  disconnected: 1,
  connected: 0,
};

const STATUS_LABELS: Record<ModuleStatusSnapshot['status'], string> = {
  connected: '已就绪',
  disconnected: '离线',
  not_installed: '未安装',
  probe_failed: '探测失败',
  auth_failed: '认证失败',
  disabled: '已禁用',
};

export function formatModuleState(module: ModuleStatusSnapshot): string {
  if (module.phase === 'probing') {
    return '探测中';
  }

  if (module.phase === 'degraded' && module.status === 'connected') {
    return '已降级';
  }

  return STATUS_LABELS[module.status] ?? module.status.replaceAll('_', ' ');
}

export function getModuleTone(module: ModuleStatusSnapshot): ModuleTone {
  if (module.phase === 'probing') {
    return 'running';
  }

  if (module.status === 'connected' && module.phase === 'ready') {
    return 'ok';
  }

  return 'attention';
}

function formatSummaryState(module: ModuleStatusSnapshot): string {
  return module.phase === 'probing' ? 'booting' : formatModuleState(module);
}

export function buildModulesSummary(modules: WorkbenchModulesSnapshot): string {
  return [
    `Core ${formatSummaryState(modules.core)}`,
    `Network ${
      modules.core.status === 'disconnected'
        ? 'offline'
        : modules.core.phase === 'probing'
          ? 'booting'
          : 'healthy'
    }`,
    `${modules.engines.claude.label} ${formatSummaryState(modules.engines.claude)}`,
    `${modules.engines.codex.label} ${formatSummaryState(modules.engines.codex)}`,
    `Soul ${formatSummaryState(modules.soul)}`,
  ].join(' | ');
}

export function selectPrimaryEngineModule(
  modules: WorkbenchModulesSnapshot,
): ModuleStatusSnapshot {
  const engines = [modules.engines.claude, modules.engines.codex];
  const connected = engines.find((module) => module.status === 'connected');
  if (connected) {
    return connected;
  }

  return [...engines].sort(
    (left, right) => ENGINE_PRIORITY[right.status] - ENGINE_PRIORITY[left.status],
  )[0];
}
