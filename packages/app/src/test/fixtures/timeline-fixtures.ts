import type { TimelineEntry, TimelinePage } from '@do-what/protocol';
import { createEmptyTimelinePage } from '../../lib/contracts';

export const ACTIVE_TIMELINE_ENTRIES: readonly TimelineEntry[] = [
  {
    body: 'Investigate the approval flow and stop the optimistic tail from disappearing.',
    id: 'entry-user-1',
    kind: 'message',
    meta: {
      laneId: 'lead',
      laneLabel: 'Lead',
      speaker: 'user',
    },
    runId: 'run-active-1',
    timestamp: '2026-03-10T09:20:00.000Z',
    title: 'User',
  },
  {
    body: 'Created a focused shell_exec verification request.',
    id: 'entry-tool-1',
    kind: 'tool_call',
    meta: {
      laneId: 'review',
      laneLabel: 'Review',
      markerKind: 'handoff',
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
      laneId: 'review',
      laneLabel: 'Review',
      markerKind: 'blocked',
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
      claim: 'Overlay reconciliation depends on ack revision and probe state.',
      dimension: 'governance',
      laneId: 'soul',
      laneLabel: 'Soul',
      manifestationState: 'proposal',
      retentionState: 'working',
      scope: 'project',
    },
    runId: 'run-active-1',
    timestamp: '2026-03-10T09:24:00.000Z',
    title: 'Soul cue',
  },
  {
    body: 'Lead node asked the integrator to verify stale markers before proceeding.',
    id: 'entry-engine-1',
    kind: 'message',
    meta: {
      engine: 'codex',
      laneId: 'integrator',
      laneLabel: 'Integrator',
      markerKind: 'integration',
    },
    runId: 'run-active-1',
    timestamp: '2026-03-10T09:25:00.000Z',
    title: 'Codex',
  },
  {
    body: 'Refetch the inspector once the approval ack revision is visible.',
    id: 'entry-plan-1',
    kind: 'plan',
    meta: {
      laneId: 'lead',
      laneLabel: 'Lead',
    },
    runId: 'run-active-1',
    timestamp: '2026-03-10T09:26:00.000Z',
    title: 'Plan',
  },
];

export const ACTIVE_TIMELINE_FIXTURE: TimelinePage = createEmptyTimelinePage('run-active-1', {
  entries: ACTIVE_TIMELINE_ENTRIES.slice(-4),
  hasMore: true,
  limit: 50,
  nextBeforeRevision: 12,
  revision: 24,
});

export const EMPTY_TIMELINE_FIXTURE: TimelinePage = createEmptyTimelinePage('run-empty-1');
