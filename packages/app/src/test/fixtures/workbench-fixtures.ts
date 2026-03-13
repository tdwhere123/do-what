import type { WorkbenchSnapshot } from '@do-what/protocol';
import { createEmptyWorkbenchSnapshot } from '../../lib/contracts';

interface ModuleOverrides {
  readonly core?: Partial<WorkbenchSnapshot['modules']['core']>;
  readonly engines?: {
    readonly claude?: Partial<WorkbenchSnapshot['modules']['engines']['claude']>;
    readonly codex?: Partial<WorkbenchSnapshot['modules']['engines']['codex']>;
  };
  readonly soul?: Partial<WorkbenchSnapshot['modules']['soul']>;
}

function createModules(
  overrides: ModuleOverrides = {},
): WorkbenchSnapshot['modules'] {
  const updatedAt = '2026-03-10T09:00:00.000Z';
  return {
    core: {
      kind: 'core',
      label: 'Core',
      moduleId: 'core',
      phase: 'ready',
      status: 'connected',
      updatedAt,
      ...overrides.core,
    },
    engines: {
      claude: {
        kind: 'engine',
        label: 'Claude',
        moduleId: 'claude',
        phase: 'degraded',
        status: 'not_installed',
        updatedAt,
        ...overrides.engines?.claude,
      },
      codex: {
        kind: 'engine',
        label: 'Codex',
        moduleId: 'codex',
        phase: 'degraded',
        status: 'not_installed',
        updatedAt,
        ...overrides.engines?.codex,
      },
    },
    soul: {
      kind: 'soul',
      label: 'Soul',
      moduleId: 'soul',
      phase: 'ready',
      status: 'connected',
      updatedAt,
      ...overrides.soul,
    },
  };
}

export const EMPTY_WORKBENCH_FIXTURE: WorkbenchSnapshot = createEmptyWorkbenchSnapshot({
  connectionState: 'connected',
  coreSessionId: 'mock-core-empty',
  modules: createModules(),
});

export const ACTIVE_WORKBENCH_FIXTURE: WorkbenchSnapshot = createEmptyWorkbenchSnapshot({
  coreSessionId: 'mock-core-active',
  modules: createModules({
    engines: {
      codex: {
        phase: 'ready',
        status: 'connected',
      },
    },
  }),
  pendingApprovals: [
    {
      approvalId: 'approval-active-1',
      createdAt: '2026-03-10T09:30:00.000Z',
      runId: 'run-active-1',
      summary: 'Approve shell_exec for targeted test run',
      toolName: 'tools.shell_exec',
    },
  ],
  revision: 24,
  runs: [
    {
      activeNodeId: 'node-review-1',
      approvalIds: ['approval-active-1'],
      engine: 'codex',
      lastEventAt: '2026-03-10T09:31:00.000Z',
      runId: 'run-active-1',
      status: 'waiting_approval',
      title: 'Fix session guard race',
      workspaceId: 'workspace-main',
    },
  ],
  workspaces: [
    {
      lastEventAt: '2026-03-10T09:31:00.000Z',
      name: 'do-what-new',
      runIds: ['run-active-1'],
      status: 'attention',
      workspaceId: 'workspace-main',
    },
  ],
});

export const DESYNCED_WORKBENCH_FIXTURE: WorkbenchSnapshot = createEmptyWorkbenchSnapshot({
  coreSessionId: 'mock-core-desynced',
  modules: createModules({
    core: {
      phase: 'degraded',
      reason: 'session drift detected',
    },
    engines: {
      claude: {
        phase: 'degraded',
        reason: 'probe failed',
        status: 'probe_failed',
      },
    },
    soul: {
      phase: 'degraded',
      reason: 'dispatcher degraded',
      status: 'probe_failed',
    },
  }),
  revision: 31,
  runs: [
    {
      activeNodeId: 'node-review-2',
      approvalIds: [],
      engine: 'claude',
      lastEventAt: '2026-03-10T10:05:00.000Z',
      runId: 'run-desynced-1',
      status: 'interrupted',
      title: 'Retry sync after lease invalidation',
      workspaceId: 'workspace-main',
    },
  ],
  workspaces: [
    {
      lastEventAt: '2026-03-10T10:05:00.000Z',
      name: 'do-what-new',
      runIds: ['run-desynced-1'],
      status: 'attention',
      workspaceId: 'workspace-main',
    },
  ],
});
