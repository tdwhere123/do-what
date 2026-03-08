import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type {
  BaselineLock,
  FocusSurface,
  GovernanceLease,
  OrchestrationTemplate,
  ValidationResult,
} from '@do-what/protocol';
import { GitOpsQueue, runGit, type GitRunner } from '@do-what/tools';
import { createReadConnection } from '../db/read-connection.js';
import type { DbWriteRequest } from '../db/worker-client.js';
import {
  BaselineCalculator,
  FocusSurfaceRegistry,
  GovernanceLeaseManager,
  GovernancePreflight,
  IntegrationGate,
  NativeSurfaceReporter,
  ReconcileTracker,
  derivePackageScope,
  inferArtifactKind,
  normalizeRepoPath,
  uniqueSortedPaths,
  type GovernanceInvalidator,
} from '../governance/index.js';
import { TopologyValidator } from '../orchestration/index.js';
import { buildDagPlan, type DagRunInput } from './dag-builder.js';
import type { FastGateResult } from './fast-gate.js';

type IntegrationOutcome = 'blocked' | 'integrated' | 'rejected';

export interface IntegrationCandidate extends DagRunInput {
  completedAt: string;
  focusSurface?: FocusSurface;
  orchestrationTemplate?: OrchestrationTemplate;
  patch: string;
  runId: string;
  touchedPaths: readonly string[];
  workspaceId: string;
}

interface PreparedIntegrationCandidate extends IntegrationCandidate {
  baselineLock: BaselineLock;
  focusSurface: FocusSurface;
  governanceLease: GovernanceLease;
  orchestrationTemplate: OrchestrationTemplate;
}

export interface IntegratorOptions {
  dbPath: string;
  dbWriter: {
    write: (request: DbWriteRequest) => Promise<void>;
  };
  eventBus: {
    publish: (event: Record<string, unknown>) => unknown;
  };
  fastGate: {
    run: (input: {
      touchedPaths: readonly string[];
      workspaceId: string;
      workspacePath: string;
    }) => Promise<FastGateResult>;
  };
  gitQueue?: GitOpsQueue;
  gitRunner?: GitRunner;
  governanceInvalidator?: GovernanceInvalidator;
  now?: () => string;
  repoPath: string;
  source?: string;
}

function createDefaultTemplate(candidate: IntegrationCandidate): OrchestrationTemplate {
  return {
    constraints: {
      max_fan_out: 3,
      max_loop_count: 3,
      max_parallel: 5,
    },
    edges: [],
    nodes: [
      {
        kind: 'worker',
        node_id: candidate.runId,
      },
    ],
    template_id: `template-${candidate.runId}`,
    topology: 'linear',
    topology_hint: 'linear',
  };
}

function createDefaultFocusSurface(
  candidate: IntegrationCandidate,
  now: () => string,
): FocusSurface {
  const normalizedPaths = uniqueSortedPaths(candidate.touchedPaths);
  return {
    artifact_kind: [...new Set(normalizedPaths.map((filePath) => inferArtifactKind(filePath)))],
    baseline_fingerprint: 'pending',
    created_at: now(),
    package_scope: derivePackageScope(normalizedPaths),
    path_globs: normalizedPaths,
    surface_id: `surface-${candidate.runId}`,
    workspace_id: candidate.workspaceId,
  };
}

export class Integrator {
  private readonly dbPath: string;
  private readonly dbWriter: IntegratorOptions['dbWriter'];
  private readonly eventBus: IntegratorOptions['eventBus'];
  private readonly fastGate: IntegratorOptions['fastGate'];
  private readonly focusSurfaceRegistry: FocusSurfaceRegistry;
  private readonly gitQueue: GitOpsQueue;
  private readonly gitRunner: GitRunner;
  private readonly governancePreflight: GovernancePreflight;
  private readonly integrationGate: IntegrationGate;
  private readonly leaseManager: GovernanceLeaseManager;
  private readonly now: () => string;
  private readonly pending = new Map<string, PreparedIntegrationCandidate>();
  private processing = false;
  private readonly reconcileTracker: ReconcileTracker;
  private readonly repoPath: string;
  private readonly source: string;
  private readonly topologyValidator: TopologyValidator;

  constructor(options: IntegratorOptions) {
    const now = options.now ?? (() => new Date().toISOString());
    const gitRunner = options.gitRunner ?? runGit;
    const baselineCalculator = new BaselineCalculator({
      gitRunner,
      now,
      repoPath: options.repoPath,
    });
    const reconcileTracker = new ReconcileTracker();
    const leaseManager = new GovernanceLeaseManager({
      dbPath: options.dbPath,
      dbWriter: options.dbWriter,
      eventBus: options.eventBus,
      governanceInvalidator: options.governanceInvalidator,
      now,
    });

    this.dbPath = options.dbPath;
    this.dbWriter = options.dbWriter;
    this.eventBus = options.eventBus;
    this.fastGate = options.fastGate;
    this.focusSurfaceRegistry = new FocusSurfaceRegistry({
      baselineCalculator,
      dbPath: options.dbPath,
      dbWriter: options.dbWriter,
    });
    this.gitQueue = options.gitQueue ?? new GitOpsQueue();
    this.gitRunner = gitRunner;
    this.governancePreflight = new GovernancePreflight({
      leaseManager,
      reporter: new NativeSurfaceReporter({ now }),
    });
    this.integrationGate = new IntegrationGate({
      baselineCalculator,
      reconcileTracker,
    });
    this.leaseManager = leaseManager;
    this.now = now;
    this.reconcileTracker = reconcileTracker;
    this.repoPath = options.repoPath;
    this.source = options.source ?? 'core.integrator';
    this.topologyValidator = new TopologyValidator();
  }

  async submit(candidate: IntegrationCandidate): Promise<void> {
    const preparedCandidate = await this.prepareCandidate(candidate);
    if (!preparedCandidate) {
      return;
    }

    this.pending.set(candidate.runId, preparedCandidate);
    await this.processPending();
  }

  private async prepareCandidate(
    candidate: IntegrationCandidate,
  ): Promise<PreparedIntegrationCandidate | null> {
    const orchestrationTemplate = candidate.orchestrationTemplate ?? createDefaultTemplate(candidate);
    const topologyValidation = this.topologyValidator.validate(orchestrationTemplate);
    if (!topologyValidation.valid) {
      await this.mergeRunMetadata(candidate.runId, {
        integrationStatus: 'topology_invalid',
        topologyValidation,
      });
      this.eventBus.publish({
        event: 'run_topology_invalid',
        runId: candidate.runId,
        source: this.source,
        timestamp: this.now(),
        topologyKind: topologyValidation.topology_kind,
        violations: topologyValidation.violations,
        workspaceId: candidate.workspaceId,
      });
      return null;
    }

    const focusSurface = candidate.focusSurface ?? createDefaultFocusSurface(candidate, this.now);
    const registeredSurface = await this.focusSurfaceRegistry.register(candidate.runId, focusSurface);
    const preflightResult = await this.governancePreflight.evaluate(
      candidate.runId,
      registeredSurface.surface,
    );
    if (!preflightResult.allowed || !preflightResult.lease) {
      await this.mergeRunMetadata(candidate.runId, {
        governancePreflight: preflightResult.report,
        integrationStatus: 'start_denied',
      });
      this.eventBus.publish({
        conflictKind: preflightResult.conflictKind,
        event: 'run_start_denied',
        reason: preflightResult.reason ?? 'run denied by governance preflight',
        runId: candidate.runId,
        source: this.source,
        surfaceId: registeredSurface.surface.surface_id,
        timestamp: this.now(),
        workspaceId: candidate.workspaceId,
      });
      return null;
    }

    await this.mergeRunMetadata(candidate.runId, {
      baselineLock: registeredSurface.lock,
      focusSurface: registeredSurface.surface,
      governanceLease: preflightResult.lease,
      topologyKind: topologyValidation.topology_kind,
      topologyValidation,
    });

    return {
      ...candidate,
      baselineLock: registeredSurface.lock,
      focusSurface: registeredSurface.surface,
      governanceLease: preflightResult.lease,
      orchestrationTemplate,
    };
  }

  private async processPending(): Promise<void> {
    if (this.processing) {
      return;
    }

    this.processing = true;
    try {
      while (this.pending.size > 0) {
        const dag = buildDagPlan([...this.pending.values()]);
        const nextRunId = dag.order[0];
        if (!nextRunId) {
          return;
        }

        const candidate = this.pending.get(nextRunId);
        if (!candidate) {
          return;
        }

        const outcome = await this.integrateCandidate(candidate);
        if (outcome === 'blocked') {
          return;
        }
        this.pending.delete(candidate.runId);
      }
    } finally {
      this.processing = false;
    }
  }

  private async integrateCandidate(
    candidate: PreparedIntegrationCandidate,
  ): Promise<IntegrationOutcome> {
    const gateEvaluation = await this.integrationGate.canMerge(
      candidate.runId,
      candidate.baselineLock,
      candidate.focusSurface,
    );
    await this.mergeRunMetadata(candidate.runId, {
      driftAssessment: gateEvaluation.assessment,
      mergeDecision: gateEvaluation.decision,
    });

    if (!gateEvaluation.decision.allowed) {
      await this.mergeRunMetadata(candidate.runId, {
        integrationStatus: 'serialized',
      });
      this.eventBus.publish({
        event: 'run_serialized',
        reason: 'hard_stale_serialize',
        reconcileCount: gateEvaluation.decision.reconcile_count,
        runId: candidate.runId,
        source: this.source,
        timestamp: this.now(),
        touchedPaths: [...candidate.touchedPaths],
        workspaceId: candidate.workspaceId,
      });
      await this.leaseManager.release(candidate.runId);
      this.reconcileTracker.clear(candidate.runId);
      return 'rejected';
    }

    if (candidate.patch.trim().length > 0) {
      try {
        await this.gitQueue.enqueue(this.repoPath, async () => {
          await this.applyPatch(candidate.patch);
        });
      } catch (error) {
        await this.mergeRunMetadata(candidate.runId, {
          integrationError: error instanceof Error ? error.message : String(error),
          integrationStatus: 'conflict',
        });
        this.eventBus.publish({
          event: 'conflict',
          reason: error instanceof Error ? error.message : String(error),
          revision: 0,
          runId: candidate.runId,
          source: this.source,
          timestamp: this.now(),
          touchedPaths: [...candidate.touchedPaths],
          workspaceId: candidate.workspaceId,
        });
        return 'blocked';
      }
    }

    const gateResult = await this.fastGate.run({
      touchedPaths: candidate.touchedPaths,
      workspaceId: candidate.workspaceId,
      workspacePath: this.repoPath,
    });

    if (!gateResult.passed) {
      await this.persistIntegrationMetadata(candidate.runId, {
        gate: gateResult,
        integrationStatus: 'gate_failed',
      });
      this.eventBus.publish({
        afterErrorCount: gateResult.afterErrorCount,
        baselineErrorCount: gateResult.baselineErrorCount,
        event: 'gate_failed',
        newDiagnostics: [...gateResult.newDiagnostics],
        revision: 0,
        runId: candidate.runId,
        source: this.source,
        timestamp: this.now(),
        touchedPaths: [...candidate.touchedPaths],
        workspaceId: candidate.workspaceId,
      });
      this.eventBus.publish({
        affectedRunIds: [...this.pending.keys()].filter((runId) => runId !== candidate.runId),
        event: 'replay_requested',
        revision: 0,
        runId: candidate.runId,
        source: this.source,
        timestamp: this.now(),
        touchedPaths: [...candidate.touchedPaths],
        workspaceId: candidate.workspaceId,
      });
      return 'blocked';
    }

    await this.persistIntegrationMetadata(candidate.runId, {
      gate: gateResult,
      integrationStatus: 'gate_passed',
    });
    this.eventBus.publish({
      afterErrorCount: gateResult.afterErrorCount,
      baselineErrorCount: gateResult.baselineErrorCount,
      event: 'gate_passed',
      revision: 0,
      runId: candidate.runId,
      source: this.source,
      timestamp: this.now(),
      touchedPaths: [...candidate.touchedPaths],
      workspaceId: candidate.workspaceId,
    });
    await this.leaseManager.release(candidate.runId);
    await this.leaseManager.invalidateByPaths({
      changedPaths: candidate.touchedPaths,
      sourceRunId: candidate.runId,
      workspaceId: candidate.workspaceId,
    });
    this.reconcileTracker.clear(candidate.runId);
    return 'integrated';
  }

  private async applyPatch(patch: string): Promise<void> {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'do-what-integrator-'));
    const patchPath = path.join(tempDir, 'integration.patch');
    fs.writeFileSync(patchPath, patch, 'utf8');
    try {
      await this.gitRunner(['apply', '--index', patchPath], {
        cwd: this.repoPath,
      });
    } finally {
      fs.rmSync(tempDir, { force: true, recursive: true });
    }
  }

  private loadRunMetadata(runId: string): Record<string, unknown> {
    const db = createReadConnection(this.dbPath);
    try {
      const row = db
        .prepare('SELECT metadata FROM runs WHERE run_id = ?')
        .get(runId) as { metadata: string | null } | undefined;
      if (!row?.metadata) {
        return {};
      }

      return JSON.parse(row.metadata) as Record<string, unknown>;
    } catch (error) {
      console.warn('[core][integrator] failed to load run metadata', error);
      return {};
    } finally {
      db.close();
    }
  }

  private async mergeRunMetadata(
    runId: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    const currentMetadata = this.loadRunMetadata(runId);
    const nextMetadata = {
      ...currentMetadata,
      ...payload,
    };
    await this.dbWriter.write({
      params: [JSON.stringify(nextMetadata), this.now(), runId],
      sql: `UPDATE runs
            SET metadata = ?, updated_at = ?
            WHERE run_id = ?`,
    });
  }

  private async persistIntegrationMetadata(
    runId: string,
    payload: {
      gate?: FastGateResult;
      integrationError?: string;
      integrationStatus: string;
    },
  ): Promise<void> {
    const integrationGateMetadata =
      payload.gate
        ? {
            afterErrorCount: payload.gate.afterErrorCount,
            baselineErrorCount: payload.gate.baselineErrorCount,
            delta: payload.gate.delta,
            newDiagnostics: payload.gate.newDiagnostics,
            passed: payload.gate.passed,
          }
        : undefined;
    await this.mergeRunMetadata(runId, {
      integrationError: payload.integrationError,
      integrationGate: integrationGateMetadata,
      integrationStatus: payload.integrationStatus,
    });
  }
}
