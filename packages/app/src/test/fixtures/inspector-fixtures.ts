import type { InspectorSnapshot } from '@do-what/protocol';
import { createEmptyInspectorSnapshot } from '../../lib/contracts';

export const ACTIVE_INSPECTOR_FIXTURE: InspectorSnapshot = createEmptyInspectorSnapshot(
  'run-active-1',
  {
    files: [
      {
        path: 'packages/app/src/lib/core-event-client/core-event-client.ts',
        status: 'modified',
        summary: 'Normalize and dispatch a single SSE pipeline',
      },
      {
        path: 'packages/app/src/stores/ack-overlay-store.ts',
        status: 'added',
        summary: 'Future overlay state machine landing spot',
      },
    ],
    governance: {
      checkpoints: {
        pending: [
          {
            id: 'checkpoint-pending-1',
            label: 'Checkpoint before approval request',
          },
        ],
        recent: [
          {
            id: 'checkpoint-recent-1',
            label: 'Checkpoint after event client boot',
            timestamp: '2026-03-10T09:12:00.000Z',
          },
        ],
      },
      driftState: 'soft_stale',
      gateState: 'waiting_reconcile',
      hardStaleNodes: [],
      leaseStatus: 'active',
      nativeSurfaceReport: ['packages/app', 'packages/protocol'],
      softStaleNodes: [
        {
          nodeId: 'node-review-1',
          summary: 'Approval response is waiting on a newer snapshot.',
        },
      ],
    },
    history: [
      {
        id: 'history-1',
        label: 'Checkpoint before approval request',
        timestamp: '2026-03-10T09:18:00.000Z',
        type: 'checkpoint',
      },
      {
        id: 'history-2',
        label: 'Integrator reconciled stale node',
        timestamp: '2026-03-10T09:26:00.000Z',
        type: 'governance',
      },
    ],
    overview: {
      branch: 'feature/workbench-shell',
      collaboration: [
        {
          id: 'node-lead-1',
          lastAction: 'Delegated approval review',
          role: 'lead',
          title: 'Lead Node',
        },
        {
          id: 'node-review-1',
          lastAction: 'Waiting on tools.shell_exec',
          role: 'review',
          title: 'Review Node',
        },
      ],
      diffSummary: '+58 -14',
      engine: 'codex',
      gitTree: [
        'packages/app/src/app',
        'packages/app/src/stores',
        'packages/app/src/components',
      ],
      workspaceName: 'do-what-new',
    },
    plans: [
      {
        id: 'plan-1',
        status: 'active',
        summary: 'Implement the unified SSE client and session guard',
      },
      {
        id: 'plan-2',
        status: 'pending',
        summary: 'Backfill approval reconciliation visuals',
      },
    ],
    revision: 24,
  },
);

export const EMPTY_INSPECTOR_FIXTURE: InspectorSnapshot =
  createEmptyInspectorSnapshot('run-empty-1');
