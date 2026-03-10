import type { WorkbenchSnapshot } from '@do-what/protocol';
import { createEmptyWorkbenchSnapshot } from '../../lib/contracts';

export const EMPTY_WORKBENCH_FIXTURE: WorkbenchSnapshot = createEmptyWorkbenchSnapshot({
  connectionState: 'connected',
  coreSessionId: 'mock-core-empty',
  health: {
    claude: 'idle',
    codex: 'idle',
    core: 'healthy',
    network: 'healthy',
    soul: 'idle',
  },
});

export const ACTIVE_WORKBENCH_FIXTURE: WorkbenchSnapshot = createEmptyWorkbenchSnapshot({
  coreSessionId: 'mock-core-active',
  health: {
    claude: 'running',
    codex: 'idle',
    core: 'healthy',
    network: 'healthy',
    soul: 'running',
  },
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
  health: {
    claude: 'degraded',
    codex: 'idle',
    core: 'degraded',
    network: 'healthy',
    soul: 'degraded',
  },
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
