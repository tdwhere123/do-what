import type { EventObject } from 'xstate';

import type { RunLifecycleEvent } from '../events/run.js';

export type RunStatus = RunLifecycleEvent['status'];

export interface RunContext {
  runId: string;
  status: RunStatus;
  workspaceId: string;
  agentId?: string;
  engineType: string;
  createdAt: string;
  error?: string;
}

export type RunEvent =
  | ({
      type: 'RUN_CREATED';
      data: Extract<RunLifecycleEvent, { status: 'created' }>;
    } & EventObject)
  | ({
      type: 'RUN_STARTED';
      data: Extract<RunLifecycleEvent, { status: 'started' }>;
    } & EventObject)
  | ({
      type: 'RUN_WAITING_APPROVAL';
      data: Extract<RunLifecycleEvent, { status: 'waiting_approval' }>;
    } & EventObject)
  | ({
      type: 'RUN_COMPLETED';
      data: Extract<RunLifecycleEvent, { status: 'completed' }>;
    } & EventObject)
  | ({
      type: 'RUN_FAILED';
      data: Extract<RunLifecycleEvent, { status: 'failed' }>;
    } & EventObject)
  | ({
      type: 'RUN_CANCELLED';
      data: Extract<RunLifecycleEvent, { status: 'cancelled' }>;
    } & EventObject)
  | ({
      type: 'RUN_INTERRUPTED';
      data: Extract<RunLifecycleEvent, { status: 'interrupted' }>;
    } & EventObject);
