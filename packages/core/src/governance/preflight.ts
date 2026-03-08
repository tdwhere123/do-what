import type {
  ConflictKind,
  FocusSurface,
  GovernanceLease,
  NativeSurfaceReport,
} from '@do-what/protocol';
import { buildConflictConclusions } from './path-utils.js';
import { GovernanceLeaseManager } from './lease-manager.js';
import { NativeSurfaceReporter } from './native-surface-report.js';

const MAX_ACTIVE_LEASES = 5;

export interface GovernancePreflightOptions {
  leaseManager: GovernanceLeaseManager;
  reporter: NativeSurfaceReporter;
}

export interface GovernancePreflightResult {
  allowed: boolean;
  conflictKind?: ConflictKind;
  lease?: GovernanceLease;
  reason?: string;
  report: NativeSurfaceReport;
}

export class GovernancePreflight {
  private readonly leaseManager: GovernanceLeaseManager;
  private readonly reporter: NativeSurfaceReporter;

  constructor(options: GovernancePreflightOptions) {
    this.leaseManager = options.leaseManager;
    this.reporter = options.reporter;
  }

  async evaluate(runId: string, surface: FocusSurface): Promise<GovernancePreflightResult> {
    await this.leaseManager.expireStaleLeases();
    const activeLeases = this.leaseManager
      .listActive(surface.workspace_id)
      .filter((lease) => lease.run_id !== runId);
    const report = this.reporter.generateReport(
      surface.workspace_id,
      runId,
      surface,
      activeLeases,
    );

    if (activeLeases.length >= MAX_ACTIVE_LEASES) {
      return {
        allowed: false,
        reason: 'active governance lease limit reached',
        report,
      };
    }

    const conflictConclusions = buildConflictConclusions(surface, activeLeases);
    const blockingConflict = conflictConclusions.find(
      (conclusion) =>
        conclusion.conflict_kind === 'schema_conflict'
        || conclusion.conflict_kind === 'migration_conflict',
    );
    if (blockingConflict) {
      return {
        allowed: false,
        conflictKind: blockingConflict.conflict_kind,
        reason: 'conflicting governance lease',
        report,
      };
    }

    return {
      allowed: true,
      lease: await this.leaseManager.issue(runId, surface, conflictConclusions),
      report,
    };
  }
}
