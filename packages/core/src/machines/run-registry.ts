import type { RunLifecycleEvent } from '@do-what/protocol';
import { createActor } from 'xstate';
import { createReadConnection } from '../db/read-connection.js';
import type { DbWriteRequest } from '../db/worker-client.js';
import {
  RUN_TERMINAL_STATES,
  createRunActor,
  runMachine,
  type RunActor,
  type RunMachineEvent,
  type RunMachineInput,
} from './run-machine.js';

export interface RunRegistryOptions {
  agentStuckThreshold?: number;
  dbWriter?: {
    write: (request: DbWriteRequest) => Promise<void>;
  };
  eventBus?: {
    publish: (event: Omit<RunLifecycleEvent, 'revision'>) => unknown;
  };
  now?: () => string;
  policyEvaluate?: RunMachineInput['policyEvaluate'];
  source?: string;
}

export interface CreateRunInput {
  agentId?: string;
  engineType: string;
  runId: string;
  workspaceId: string;
}

interface RehydrateRow {
  agent_id: string | null;
  engine_type: string;
  run_id: string;
  workspace_id: string;
}

const NON_TERMINAL_RUN_STATUSES = ['created', 'started', 'running', 'waiting_approval'];

export class RunRegistry {
  private readonly actors = new Map<string, RunActor>();
  private readonly options: RunRegistryOptions;

  constructor(options: RunRegistryOptions) {
    this.options = options;
  }

  create(input: CreateRunInput): RunActor {
    if (this.actors.has(input.runId)) {
      throw new Error(`run actor already exists for ${input.runId}`);
    }

    const actor = createActor(runMachine, {
      input: {
        agentId: input.agentId,
        agentStuckThreshold: this.options.agentStuckThreshold,
        dbWriter: this.options.dbWriter,
        engineType: input.engineType,
        eventBus: this.options.eventBus,
        now: this.options.now,
        policyEvaluate: this.options.policyEvaluate,
        runId: input.runId,
        source: this.options.source,
        workspaceId: input.workspaceId,
      },
    });
    actor.start();

    this.actors.set(input.runId, actor);
    return actor;
  }

  destroyCompleted(): void {
    for (const [runId, actor] of this.actors.entries()) {
      const snapshot = actor.getSnapshot();
      const stateValue = String(snapshot.value);
      if (RUN_TERMINAL_STATES.includes(stateValue as (typeof RUN_TERMINAL_STATES)[number])) {
        actor.stop();
        this.actors.delete(runId);
      }
    }
  }

  get(runId: string): RunActor | undefined {
    return this.actors.get(runId);
  }

  listRunIds(): string[] {
    return [...this.actors.keys()];
  }

  send(runId: string, event: RunMachineEvent): boolean {
    const actor = this.actors.get(runId);
    if (!actor) {
      return false;
    }
    actor.send(event);
    return true;
  }

  stopAll(): void {
    for (const actor of this.actors.values()) {
      actor.stop();
    }
    this.actors.clear();
  }
}

export async function rehydrateRuns(options: {
  dbPath: string;
  dbWriter: {
    write: (request: DbWriteRequest) => Promise<void>;
  };
  eventBus?: {
    publish: (event: Omit<RunLifecycleEvent, 'revision'>) => unknown;
  };
  now?: () => string;
  source?: string;
}): Promise<number> {
  const db = createReadConnection(options.dbPath);
  try {
    const placeholders = NON_TERMINAL_RUN_STATUSES.map(() => '?').join(', ');
    const rows = db
      .prepare(
        `SELECT run_id, workspace_id, agent_id, engine_type
         FROM runs
         WHERE status IN (${placeholders})`,
      )
      .all(...NON_TERMINAL_RUN_STATUSES) as RehydrateRow[];

    const now = options.now ?? (() => new Date().toISOString());
    for (const row of rows) {
      const interruptedAt = now();
      await options.dbWriter.write({
        params: [interruptedAt, interruptedAt, row.run_id],
        sql: `UPDATE runs
              SET status = 'interrupted', updated_at = ?, completed_at = ?
              WHERE run_id = ?`,
      });

      options.eventBus?.publish({
        reason: 'core_restart',
        runId: row.run_id,
        source: options.source ?? 'core.rehydrate',
        status: 'interrupted',
        timestamp: interruptedAt,
      });
    }

    return rows.length;
  } catch (error) {
    console.warn('[core][run-registry] rehydrate skipped', error);
    return 0;
  } finally {
    db.close();
  }
}

export { createRunActor };

