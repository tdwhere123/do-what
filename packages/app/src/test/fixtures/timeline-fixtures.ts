import type { TimelinePage } from '@do-what/protocol';
import { createEmptyTimelinePage } from '../../lib/contracts';

export const ACTIVE_TIMELINE_FIXTURE: TimelinePage = createEmptyTimelinePage('run-active-1', {
  entries: [
    {
      body: 'Investigate the approval flow and stop the optimistic tail from disappearing.',
      id: 'entry-user-1',
      kind: 'message',
      runId: 'run-active-1',
      timestamp: '2026-03-10T09:20:00.000Z',
      title: 'User',
    },
    {
      body: 'Found the stale overlay path. Preparing a targeted shell_exec verification.',
      id: 'entry-engine-1',
      kind: 'message',
      meta: {
        engine: 'codex',
      },
      runId: 'run-active-1',
      timestamp: '2026-03-10T09:21:00.000Z',
      title: 'Codex',
    },
    {
      body: 'pnpm --filter @do-what/app test -- --testNamePattern "event-client"',
      id: 'entry-tool-1',
      kind: 'tool_call',
      meta: {
        toolName: 'tools.shell_exec',
      },
      runId: 'run-active-1',
      status: 'pending',
      timestamp: '2026-03-10T09:22:00.000Z',
      title: 'shell_exec',
    },
    {
      body: 'Approval required before the command can continue.',
      id: 'entry-approval-1',
      kind: 'approval',
      meta: {
        approvalId: 'approval-active-1',
      },
      runId: 'run-active-1',
      status: 'pending',
      timestamp: '2026-03-10T09:23:00.000Z',
      title: 'Approval',
    },
    {
      body: 'Pending command may enter desynced if Core session changes before ack reconciliation.',
      id: 'entry-memory-1',
      kind: 'memory',
      meta: {
        cueId: 'cue-1',
        level: 'consolidated',
      },
      runId: 'run-active-1',
      timestamp: '2026-03-10T09:24:00.000Z',
      title: 'Soul cue',
    },
  ],
  hasMore: true,
  limit: 50,
  nextBeforeRevision: 12,
  revision: 24,
});

export const EMPTY_TIMELINE_FIXTURE: TimelinePage = createEmptyTimelinePage('run-empty-1');
