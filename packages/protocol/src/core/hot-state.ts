import type { BaseEvent } from '../events/base.js';
import type { ModuleKind, ModulePhase, ModuleStatus } from './module-status.js';

export type RunHotStatus =
  | 'created'
  | 'started'
  | 'running'
  | 'waiting_approval'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'interrupted'
  | 'governance_invalid';

export type EngineHotStatus =
  | 'disconnected'
  | 'connected'
  | 'degraded'
  | 'circuit_open';

export interface RunHotState {
  readonly run_id: string;
  readonly status: RunHotStatus;
  readonly workspace_id?: string;
  readonly engine_type?: string;
  readonly agent_id?: string;
  readonly active_approval_id?: string;
  readonly active_tool_name?: string;
  readonly started_at?: string;
  readonly updated_at: string;
  readonly error?: string;
}

export interface EngineHotState {
  readonly engine_id: string;
  readonly kind: 'claude' | 'codex';
  readonly status: EngineHotStatus;
  readonly current_run_id?: string;
  readonly updated_at: string;
  readonly version?: string;
  readonly reason?: string;
}

export interface ApprovalHotState {
  readonly approval_id: string;
  readonly run_id: string;
  readonly tool_name: string;
  readonly status: 'pending' | 'approved' | 'denied' | 'timeout';
  readonly requested_at: string;
  readonly resolved_at?: string;
  readonly resolver?: 'policy' | 'user' | 'timeout';
}

export interface CheckpointHotState {
  readonly checkpoint_id: string;
  readonly run_id: string;
  readonly project_id?: string;
  readonly active: boolean;
  readonly triggered_at: string;
}

export interface ModuleHotState {
  readonly kind: ModuleKind;
  readonly label: string;
  readonly meta?: Readonly<Record<string, unknown>>;
  readonly module_id: string;
  readonly phase: ModulePhase;
  readonly reason?: string;
  readonly status: ModuleStatus;
  readonly updated_at: string;
}

export interface ModulesHotState {
  readonly core: ModuleHotState;
  readonly engines: Readonly<{
    claude: ModuleHotState;
    codex: ModuleHotState;
  }>;
  readonly soul: ModuleHotState;
}

export interface CoreHotState {
  readonly modules: ModulesHotState;
  readonly runs: ReadonlyMap<string, RunHotState>;
  readonly engines: ReadonlyMap<string, EngineHotState>;
  readonly pending_approvals: ReadonlyMap<string, ApprovalHotState>;
  readonly active_checkpoints: ReadonlyMap<string, CheckpointHotState>;
  readonly recent_events: readonly BaseEvent[];
  readonly last_event_seq: number;
}
