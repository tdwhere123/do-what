import type { GovernanceLease, FocusSurface } from '@do-what/protocol';
import { randomUUID } from 'node:crypto';
import { createReadConnection } from '../db/read-connection.js';
import { TABLE_GOVERNANCE_LEASES } from '../db/schema.js';
import type { DbWriteRequest } from '../db/worker-client.js';
import { deriveInvalidationConditions, shouldInvalidateLease } from './path-utils.js';

export interface GovernanceInvalidator {
  invalidateRun: (runId: string, reason: string) => Promise<void> | void;
}

export interface GovernanceLeaseManagerOptions {
  dbPath: string;
  dbWriter: {
    write: (request: DbWriteRequest) => Promise<void>;
  };
  eventBus?: {
    publish: (event: Record<string, unknown>) => unknown;
  };
  governanceInvalidator?: GovernanceInvalidator;
  now?: () => string;
}

interface GovernanceLeaseRow {
  conflict_conclusions: string;
  expires_at: string;
  invalidation_conditions: string;
  issued_at: string;
  lease_id: string;
  run_id: string;
  status: GovernanceLease['status'];
  surface_id: string;
  valid_snapshot: string;
  workspace_id: string;
}

export class GovernanceLeaseManager {
  private readonly dbPath: string;
  private readonly dbWriter: GovernanceLeaseManagerOptions['dbWriter'];
  private readonly eventBus?: GovernanceLeaseManagerOptions['eventBus'];
  private readonly governanceInvalidator?: GovernanceInvalidator;
  private readonly now: () => string;

  constructor(options: GovernanceLeaseManagerOptions) {
    this.dbPath = options.dbPath;
    this.dbWriter = options.dbWriter;
    this.eventBus = options.eventBus;
    this.governanceInvalidator = options.governanceInvalidator;
    this.now = options.now ?? (() => new Date().toISOString());
  }

  async expireStaleLeases(): Promise<void> {
    await this.dbWriter.write({
      params: [this.now()],
      sql: `UPDATE ${TABLE_GOVERNANCE_LEASES}
            SET status = 'expired'
            WHERE status = 'active' AND expires_at <= ?`,
    });
  }

  async issue(
    runId: string,
    surface: FocusSurface,
    conflictConclusions: GovernanceLease['conflict_conclusions'],
  ): Promise<GovernanceLease> {
    const issuedAt = this.now();
    const expiresAt = new Date(Date.parse(issuedAt) + 4 * 60 * 60 * 1000).toISOString();
    const lease: GovernanceLease = {
      conflict_conclusions: conflictConclusions,
      expires_at: expiresAt,
      invalidation_conditions: deriveInvalidationConditions(surface),
      issued_at: issuedAt,
      lease_id: randomUUID(),
      run_id: runId,
      status: 'active',
      surface_id: surface.surface_id,
      valid_snapshot: surface,
      workspace_id: surface.workspace_id,
    };
    await this.dbWriter.write({
      params: [
        lease.lease_id,
        lease.run_id,
        lease.workspace_id,
        lease.surface_id,
        JSON.stringify(lease.valid_snapshot),
        JSON.stringify(lease.conflict_conclusions),
        JSON.stringify(lease.invalidation_conditions),
        lease.issued_at,
        lease.expires_at,
        lease.status,
      ],
      sql: `INSERT INTO ${TABLE_GOVERNANCE_LEASES} (
              lease_id,
              run_id,
              workspace_id,
              surface_id,
              valid_snapshot,
              conflict_conclusions,
              invalidation_conditions,
              issued_at,
              expires_at,
              status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(run_id) DO UPDATE SET
              lease_id = excluded.lease_id,
              workspace_id = excluded.workspace_id,
              surface_id = excluded.surface_id,
              valid_snapshot = excluded.valid_snapshot,
              conflict_conclusions = excluded.conflict_conclusions,
              invalidation_conditions = excluded.invalidation_conditions,
              issued_at = excluded.issued_at,
              expires_at = excluded.expires_at,
              status = excluded.status`,
    });
    return lease;
  }

  listActive(workspaceId: string): GovernanceLease[] {
    const db = createReadConnection(this.dbPath);
    try {
      const rows = db
        .prepare(
          `SELECT lease_id,
                  run_id,
                  workspace_id,
                  surface_id,
                  valid_snapshot,
                  conflict_conclusions,
                  invalidation_conditions,
                  issued_at,
                  expires_at,
                  status
           FROM ${TABLE_GOVERNANCE_LEASES}
           WHERE workspace_id = ?
             AND status = 'active'
             AND expires_at > ?
           ORDER BY issued_at ASC`,
        )
        .all(workspaceId, this.now()) as GovernanceLeaseRow[];
      return rows.map((row) => ({
        conflict_conclusions: JSON.parse(
          row.conflict_conclusions,
        ) as GovernanceLease['conflict_conclusions'],
        expires_at: row.expires_at,
        invalidation_conditions: JSON.parse(
          row.invalidation_conditions,
        ) as GovernanceLease['invalidation_conditions'],
        issued_at: row.issued_at,
        lease_id: row.lease_id,
        run_id: row.run_id,
        status: row.status,
        surface_id: row.surface_id,
        valid_snapshot: JSON.parse(row.valid_snapshot) as GovernanceLease['valid_snapshot'],
        workspace_id: row.workspace_id,
      }));
    } catch (error) {
      console.warn('[core][governance] failed to list active leases', error);
      return [];
    } finally {
      db.close();
    }
  }

  async release(runId: string): Promise<void> {
    await this.dbWriter.write({
      params: [runId],
      sql: `UPDATE ${TABLE_GOVERNANCE_LEASES}
            SET status = 'released'
            WHERE run_id = ?`,
    });
  }

  async invalidateByPaths(input: {
    changedPaths: readonly string[];
    sourceRunId: string;
    workspaceId: string;
  }): Promise<void> {
    const leases = this.listActive(input.workspaceId).filter(
      (lease) => lease.run_id !== input.sourceRunId,
    );
    for (const lease of leases) {
      if (!shouldInvalidateLease(lease, input.changedPaths)) {
        continue;
      }

      await this.dbWriter.write({
        params: [lease.run_id],
        sql: `UPDATE ${TABLE_GOVERNANCE_LEASES}
              SET status = 'invalidated'
              WHERE run_id = ?`,
      });
      await this.notifyInvalidation(lease.run_id, 'lease invalidated by main changes');
    }
  }

  private async notifyInvalidation(runId: string, reason: string): Promise<void> {
    if (this.governanceInvalidator) {
      await this.governanceInvalidator.invalidateRun(runId, reason);
      return;
    }

    const timestamp = this.now();
    await this.dbWriter.write({
      params: [timestamp, timestamp, runId],
      sql: `UPDATE runs
            SET status = 'governance_invalid',
                updated_at = ?,
                completed_at = ?
            WHERE run_id = ?`,
    });
    this.eventBus?.publish({
      reason,
      runId,
      source: 'core.governance',
      status: 'governance_invalid',
      timestamp,
    });
  }
}
