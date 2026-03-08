import { randomUUID } from 'node:crypto';
import type {
  FocusSurface,
  GovernanceLease,
  NativeSurfaceReport,
  SurfaceStatus,
} from '@do-what/protocol';
import {
  buildConflictConclusions,
  isShadowedSurface,
} from './path-utils.js';

export interface NativeSurfaceReporterOptions {
  now?: () => string;
}

export class NativeSurfaceReporter {
  private readonly now: () => string;

  constructor(options: NativeSurfaceReporterOptions = {}) {
    this.now = options.now ?? (() => new Date().toISOString());
  }

  generateReport(
    workspaceId: string,
    runId: string,
    surface: FocusSurface,
    activeLeases: readonly GovernanceLease[],
  ): NativeSurfaceReport {
    const candidateConflicts = buildConflictConclusions(surface, activeLeases);
    const candidateShadowed = activeLeases.some((lease) =>
      isStrictShadow(surface, lease.valid_snapshot),
    );
    const candidateStatus: SurfaceStatus['status'] =
      candidateShadowed
        ? 'shadowed'
        : candidateConflicts.length > 0
          ? 'conflicting'
          : 'aligned';
    const activeStatuses: SurfaceStatus[] = activeLeases.map((lease) => {
      const hasConflict = buildConflictConclusions(surface, [lease]).length > 0;
      const shadowedByCandidate = isStrictShadow(lease.valid_snapshot, surface);
      const status: SurfaceStatus['status'] =
        shadowedByCandidate
          ? 'shadowed'
          : hasConflict
            ? 'conflicting'
            : 'aligned';
      return {
        drift_kind: hasConflict ? 'hard_stale' : undefined,
        lease_id: lease.lease_id,
        run_id: lease.run_id,
        status,
        surface_id: lease.surface_id,
      };
    });

    return {
      generated_at: this.now(),
      report_id: randomUUID(),
      surfaces: [
        {
          drift_kind: candidateStatus === 'conflicting' ? 'hard_stale' : undefined,
          run_id: runId,
          status: candidateStatus,
          surface_id: surface.surface_id,
        },
        ...activeStatuses,
      ],
      workspace_id: workspaceId,
    };
  }
}

function isStrictShadow(surface: FocusSurface, other: FocusSurface): boolean {
  return isShadowedSurface(surface, other) && !isShadowedSurface(other, surface);
}
