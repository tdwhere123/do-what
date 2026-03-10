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
      driftState: 'soft_stale',
      leaseStatus: 'active',
    },
    history: [
      {
        id: 'history-1',
        label: 'Checkpoint before approval request',
        timestamp: '2026-03-10T09:18:00.000Z',
        type: 'checkpoint',
      },
    ],
    overview: {
      engine: 'codex',
      workspaceName: 'do-what-new',
    },
    plans: [
      {
        id: 'plan-1',
        status: 'active',
        summary: 'Implement the unified SSE client and session guard',
      },
    ],
    revision: 24,
  },
);

export const EMPTY_INSPECTOR_FIXTURE: InspectorSnapshot =
  createEmptyInspectorSnapshot('run-empty-1');
