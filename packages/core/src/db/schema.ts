export const TABLE_EVENT_LOG = 'event_log';
export const TABLE_RUNS = 'runs';
export const TABLE_WORKSPACES = 'workspaces';
export const TABLE_AGENTS = 'agents';
export const TABLE_APPROVAL_QUEUE = 'approval_queue';
export const TABLE_SNAPSHOTS = 'snapshots';
export const TABLE_SCHEMA_VERSION = 'schema_version';
export const TABLE_DIAGNOSTICS_BASELINE = 'diagnostics_baseline';
export const TABLE_BASELINE_LOCKS = 'baseline_locks';
export const TABLE_GOVERNANCE_LEASES = 'governance_leases';

export interface EventLogRow {
  revision: number;
  timestamp: string;
  event_type: string;
  run_id: string | null;
  source: string;
  payload: string;
}

export interface RunRow {
  run_id: string;
  workspace_id: string;
  agent_id: string | null;
  engine_type: string;
  status: string;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  error: string | null;
  metadata: string | null;
}

export interface WorkspaceRow {
  workspace_id: string;
  name: string;
  root_path: string;
  engine_type: string | null;
  created_at: string;
  last_opened_at: string | null;
}

export interface AgentRow {
  agent_id: string;
  name: string;
  role: string | null;
  engine_type: string;
  memory_ns: string;
  created_at: string;
  config: string | null;
}

export interface ApprovalQueueRow {
  approval_id: string;
  run_id: string;
  tool_name: string;
  args: string;
  status: string;
  created_at: string;
  resolved_at: string | null;
  resolver: string | null;
}

export interface SnapshotRow {
  snapshot_id: string;
  revision: number;
  created_at: string;
  payload: string;
}

export interface SchemaVersionRow {
  version: number;
  applied_at: string;
  description: string;
}

export interface DiagnosticsBaselineRow {
  workspace_id: string;
  error_count: number;
  created_at: string;
  updated_at: string;
}

export interface BaselineLockRow {
  lock_id: string;
  run_id: string;
  surface_id: string;
  workspace_id: string;
  baseline_fingerprint: string;
  locked_at: string;
  files_snapshot: string;
}

export interface GovernanceLeaseRow {
  lease_id: string;
  run_id: string;
  workspace_id: string;
  surface_id: string;
  valid_snapshot: string;
  conflict_conclusions: string;
  invalidation_conditions: string;
  issued_at: string;
  expires_at: string;
  status: string;
}
