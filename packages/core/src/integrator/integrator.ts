import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { GitOpsQueue, runGit, type GitRunner } from '@do-what/tools';
import { createReadConnection } from '../db/read-connection.js';
import type { DbWriteRequest } from '../db/worker-client.js';
import { buildDagPlan, type DagRunInput } from './dag-builder.js';
import type { FastGateResult } from './fast-gate.js';

export interface IntegrationCandidate extends DagRunInput {
  completedAt: string;
  patch: string;
  runId: string;
  touchedPaths: readonly string[];
  workspaceId: string;
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
  now?: () => string;
  repoPath: string;
  source?: string;
}

export class Integrator {
  private readonly dbPath: string;
  private readonly dbWriter: IntegratorOptions['dbWriter'];
  private readonly eventBus: IntegratorOptions['eventBus'];
  private readonly fastGate: IntegratorOptions['fastGate'];
  private readonly gitQueue: GitOpsQueue;
  private readonly gitRunner: GitRunner;
  private readonly now: () => string;
  private readonly pending = new Map<string, IntegrationCandidate>();
  private processing = false;
  private readonly repoPath: string;
  private readonly source: string;

  constructor(options: IntegratorOptions) {
    this.dbPath = options.dbPath;
    this.dbWriter = options.dbWriter;
    this.eventBus = options.eventBus;
    this.fastGate = options.fastGate;
    this.gitQueue = options.gitQueue ?? new GitOpsQueue();
    this.gitRunner = options.gitRunner ?? runGit;
    this.now = options.now ?? (() => new Date().toISOString());
    this.repoPath = options.repoPath;
    this.source = options.source ?? 'core.integrator';
  }

  async submit(candidate: IntegrationCandidate): Promise<void> {
    this.pending.set(candidate.runId, candidate);
    await this.processPending();
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

        const success = await this.integrateCandidate(candidate);
        if (!success) {
          return;
        }

        this.pending.delete(candidate.runId);
      }
    } finally {
      this.processing = false;
    }
  }

  private async integrateCandidate(candidate: IntegrationCandidate): Promise<boolean> {
    if (candidate.patch.trim().length > 0) {
      try {
        await this.gitQueue.enqueue(this.repoPath, async () => {
          await this.applyPatch(candidate.patch);
        });
      } catch (error) {
        await this.persistIntegrationMetadata(candidate.runId, {
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
        return false;
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
      return false;
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
    return true;
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

  private async persistIntegrationMetadata(
    runId: string,
    payload: {
      gate?: FastGateResult;
      integrationError?: string;
      integrationStatus: string;
    },
  ): Promise<void> {
    const currentMetadata = this.loadRunMetadata(runId);
    const nextMetadata = {
      ...currentMetadata,
      integrationError: payload.integrationError,
      integrationGate:
        payload.gate
          ? {
              afterErrorCount: payload.gate.afterErrorCount,
              baselineErrorCount: payload.gate.baselineErrorCount,
              delta: payload.gate.delta,
              newDiagnostics: payload.gate.newDiagnostics,
              passed: payload.gate.passed,
            }
          : currentMetadata.integrationGate,
      integrationStatus: payload.integrationStatus,
    };

    await this.dbWriter.write({
      params: [JSON.stringify(nextMetadata), this.now(), runId],
      sql: `UPDATE runs
            SET metadata = ?, updated_at = ?
            WHERE run_id = ?`,
    });
  }
}
