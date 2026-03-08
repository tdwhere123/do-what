import type {
  BaselineLock,
  DriftAssessment,
  FocusSurface,
  MergeDecision,
} from '@do-what/protocol';
import { BaselineCalculator, diffFileSnapshots } from './baseline-calculator.js';
import { inferArtifactKind } from './path-utils.js';
import { ReconcileTracker } from './reconcile-tracker.js';

export interface IntegrationGateOptions {
  baselineCalculator: BaselineCalculator;
  reconcileTracker: ReconcileTracker;
}

export interface IntegrationGateEvaluation {
  assessment: DriftAssessment;
  currentLock: BaselineLock;
  decision: MergeDecision;
}

function classifyDrift(overlappingFiles: readonly string[]): DriftAssessment {
  if (overlappingFiles.length === 0) {
    return {
      assessment_reason: 'no overlapping baseline paths changed on main',
      drift_kind: 'ignore',
      overlapping_files: [],
    };
  }

  const softOnly = overlappingFiles.every((filePath) => {
    const artifactKind = inferArtifactKind(filePath);
    return artifactKind === 'test_file' || artifactKind === 'config';
  });

  if (softOnly) {
    return {
      assessment_reason: 'only test or config paths drifted on main',
      drift_kind: 'soft_stale',
      overlapping_files: [...overlappingFiles],
    };
  }

  return {
    assessment_reason: 'source, schema, or migration paths drifted on main',
    drift_kind: 'hard_stale',
    overlapping_files: [...overlappingFiles],
  };
}

export class IntegrationGate {
  private readonly baselineCalculator: BaselineCalculator;
  private readonly reconcileTracker: ReconcileTracker;

  constructor(options: IntegrationGateOptions) {
    this.baselineCalculator = options.baselineCalculator;
    this.reconcileTracker = options.reconcileTracker;
  }

  async assess(
    branchLock: BaselineLock,
    surface: FocusSurface,
  ): Promise<{
    assessment: DriftAssessment;
    currentLock: BaselineLock;
  }> {
    const currentLock = await this.baselineCalculator.computeBaselineLock(
      surface,
      `${branchLock.run_id}:current`,
    );
    const overlappingFiles = diffFileSnapshots(
      branchLock.files_snapshot,
      currentLock.files_snapshot,
    );
    return {
      assessment: classifyDrift(overlappingFiles),
      currentLock,
    };
  }

  async canMerge(
    runId: string,
    branchLock: BaselineLock,
    surface: FocusSurface,
  ): Promise<IntegrationGateEvaluation> {
    const { assessment, currentLock } = await this.assess(branchLock, surface);
    return {
      assessment,
      currentLock,
      decision: this.reconcileTracker.decide(runId, assessment.drift_kind),
    };
  }
}
