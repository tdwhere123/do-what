import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import type { SoulToolName } from '@do-what/protocol';
import { MEMORY_REPO_BASE_PATH, SOUL_DB_PATH } from '../config.js';
import { readSoulConfig } from '../config/soul-config.js';
import {
  ComputeProviderRegistry,
  CustomApiComputeProvider,
  DailyBudget,
  LocalHeuristics,
  OfficialApiComputeProvider,
} from '../compute/index.js';
import { CompilerTrigger } from '../compiler/compiler-trigger.js';
import { MemoryCompiler } from '../compiler/memory-compiler.js';
import { runPendingMigrations } from '../db/migration-runner.js';
import { TABLE_PROJECTS } from '../db/schema.js';
import { SoulStateStore } from '../db/soul-state-store.js';
import { SoulWorkerClient } from '../db/worker-client.js';
import { EvidenceExtractor } from '../evidence/evidence-extractor.js';
import { GitRenameDetector } from '../pointer/git-rename-detector.js';
import { HealingQueue } from '../pointer/healing-queue.js';
import { PointerRelocator } from '../pointer/pointer-relocator.js';
import { SemanticFallback } from '../pointer/semantic-fallback.js';
import { SnippetMatcher } from '../pointer/snippet-matcher.js';
import { SymbolSearcher } from '../pointer/symbol-searcher.js';
import { createProposeHandler } from './propose-handler.js';
import { createReviewExecutor, createReviewHandler } from './review-handler.js';
import { CueWriter } from '../write/cue-writer.js';
import { EdgeWriter } from '../write/edge-writer.js';
import { RepoCommitter } from '../write/repo-committer.js';
import { CheckpointQueue } from '../write/checkpoint-queue.js';
import { ProposalService } from '../write/proposal-service.js';
import { MemoryRepoManager } from '../repo/memory-repo-manager.js';
import { MemorySearchService } from '../search/memory-search.js';
import { RetrievalRouter } from '../search/retrieval-router.js';
import { createExploreGraphHandler } from './explore-graph-handler.js';
import { createOpenPointerHandler } from './open-pointer-handler.js';
import { createSearchHandler } from './search-handler.js';
import type { SoulEventPublisher, SoulToolCall, SoulToolDispatcher } from './types.js';
import { UnknownSoulToolError } from './types.js';

export interface CreateSoulToolDispatcherOptions {
  configPath?: string;
  dbPath?: string;
  eventSubscriber?: {
    off: (eventType: string, listener: (event: unknown) => void) => void;
    on: (eventType: string, listener: (event: unknown) => void) => void;
  };
  isBootstrappingProject?: (projectId: string) => boolean | Promise<boolean>;
  loadCompletedRun?: (
    runId: string,
  ) => Promise<{
    commitSha?: string;
    diff: string;
    projectId: string;
    runId: string;
    summary?: string;
  } | null>;
  memoryRepoBasePath?: string;
  publishEvent?: SoulEventPublisher;
  workspaceRoot: string;
}

type SoulHandler = (arguments_: unknown) => Promise<unknown>;

function hasOwnTool(
  handlers: Partial<Record<SoulToolName, SoulHandler>>,
  name: string,
): name is SoulToolName {
  return Object.prototype.hasOwnProperty.call(handlers, name);
}

export function createSoulToolDispatcher(
  options: CreateSoulToolDispatcherOptions,
): SoulToolDispatcher {
  const dbPath = options.dbPath ?? SOUL_DB_PATH;
  const memoryRepoBasePath = options.memoryRepoBasePath ?? MEMORY_REPO_BASE_PATH;
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const migrationDb = new Database(dbPath);
  runPendingMigrations(migrationDb);
  migrationDb.close();

  const stateStore = new SoulStateStore(dbPath);
  const writer = new SoulWorkerClient(dbPath);
  const soulConfig = readSoulConfig(options.configPath);
  const dailyBudget = new DailyBudget({
    limits: {
      maxDollars: soulConfig.daily_budget?.max_dollars,
      maxTokens: soulConfig.daily_budget?.max_tokens,
    },
    stateStore,
    writer,
  });
  const computeRegistry = new ComputeProviderRegistry({
    dailyBudget,
    providers: [
      {
        priority: 0,
        provider: new LocalHeuristics(),
      },
      {
        priority: 10,
        provider: new OfficialApiComputeProvider({
          apiKey: soulConfig.official_api?.api_key,
          baseUrl: soulConfig.official_api?.base_url,
          model: soulConfig.official_api?.model,
        }),
      },
      {
        priority: 20,
        provider: new CustomApiComputeProvider({
          config: soulConfig.custom_api,
        }),
      },
    ],
    publishEvent: options.publishEvent,
  });
  const searchService = new MemorySearchService({
    isBootstrappingProject:
      options.isBootstrappingProject ?? ((projectId) => isProjectInBootstrappingPhase(stateStore, projectId)),
    stateStore,
    writer,
  });
  const memoryRepoManager = new MemoryRepoManager({
    memoryRepoBasePath,
    stateStore,
    workspaceRoot: options.workspaceRoot,
    writer,
  });
  const cueWriter = new CueWriter({
    stateStore,
    writer,
  });
  const edgeWriter = new EdgeWriter({
    stateStore,
    writer,
  });
  const proposalService = new ProposalService({
    publishEvent: options.publishEvent,
    stateStore,
    writer,
  });
  const repoCommitter = new RepoCommitter({
    memoryRepoManager,
  });
  const reviewExecutor = createReviewExecutor({
    cueWriter,
    edgeWriter,
    proposalService,
    publishEvent: options.publishEvent,
    repoCommitter,
  });
  const checkpointQueue = new CheckpointQueue({
    proposalService,
    publishEvent: options.publishEvent,
  });
  const gitRenameDetector = new GitRenameDetector({
    stateStore,
    writer,
  });
  const healingQueue = new HealingQueue({
    relocator: new PointerRelocator({
      gitRenameDetector,
      semanticFallback: new SemanticFallback({
        workspaceRoot: options.workspaceRoot,
      }),
      snippetMatcher: new SnippetMatcher({
        workspaceRoot: options.workspaceRoot,
      }),
      stateStore,
      symbolSearcher: new SymbolSearcher({
        workspaceRoot: options.workspaceRoot,
      }),
      writer,
    }),
  });
  const memoryCompiler = new MemoryCompiler({
    dailyBudget,
    gitRenameDetector,
    proposalService,
    registry: computeRegistry,
    reviewExecutor,
    tokenBudget: {
      maxTokens: soulConfig.compiler?.default_max_tokens ?? 4_000,
    },
  });
  const compilerTrigger =
    options.eventSubscriber && options.loadCompletedRun
      ? new CompilerTrigger({
          delayMs: soulConfig.compiler?.trigger_delay_ms,
          eventSubscriber: options.eventSubscriber,
          loadCompletedRun: options.loadCompletedRun,
          memoryCompiler,
        })
      : null;
  const handlers: Partial<Record<SoulToolName, SoulHandler>> = {
    'soul.explore_graph': createExploreGraphHandler({
      publishEvent: options.publishEvent,
      stateStore,
    }),
    'soul.memory_search': createSearchHandler({
      publishEvent: options.publishEvent,
      retrievalRouter: new RetrievalRouter(searchService),
    }),
    'soul.open_pointer': createOpenPointerHandler({
      extractor: new EvidenceExtractor({
        workspaceRoot: options.workspaceRoot,
      }),
      healingQueue,
      publishEvent: options.publishEvent,
      stateStore,
      writer,
    }),
    'soul.propose_memory_update': createProposeHandler({
      checkpointQueue,
      cueWriter,
      edgeWriter,
      proposalService,
      publishEvent: options.publishEvent,
      repoCommitter,
    }),
    'soul.review_memory_proposal': createReviewHandler({
      cueWriter,
      edgeWriter,
      proposalService,
      publishEvent: options.publishEvent,
      repoCommitter,
    }),
  };

  return {
    async close() {
      await compilerTrigger?.close();
      await memoryRepoManager.close();
      await writer.close();
    },
    async dispatch(call: SoulToolCall): Promise<unknown> {
      if (!hasOwnTool(handlers, call.name)) {
        throw new UnknownSoulToolError(call.name);
      }

      const handler = handlers[call.name];
      if (!handler) {
        throw new UnknownSoulToolError(call.name);
      }

      return handler(call.arguments);
    },
    hasTool(name: string): boolean {
      return hasOwnTool(handlers, name);
    },
    async getHealingStats(): Promise<Record<string, unknown>> {
      return healingQueue.stats();
    },
    async listPendingProposals(projectId?: string): Promise<readonly Record<string, unknown>[]> {
      return checkpointQueue.getPending(projectId).map((proposal) => ({
        confidence: proposal.confidence,
        cue_draft: proposal.cueDraft,
        edge_drafts: proposal.edgeDrafts,
        impact_level: proposal.impactLevel,
        project_id: proposal.projectId,
        proposal_id: proposal.proposalId,
        proposed_at: proposal.proposedAt,
        requires_checkpoint: proposal.requiresCheckpoint,
        resolved_at: proposal.resolvedAt,
        resolver: proposal.resolver,
        status: proposal.status,
      }));
    },
  };
}

function isProjectInBootstrappingPhase(
  stateStore: SoulStateStore,
  projectId: string,
): boolean {
  return stateStore.read(
    (db) => {
      const row = db
        .prepare(
          `SELECT created_at, bootstrapping_phase_days
           FROM ${TABLE_PROJECTS}
           WHERE project_id = ?`,
        )
        .get(projectId) as
        | {
            bootstrapping_phase_days?: number;
            created_at?: string;
          }
        | undefined;
      if (!row?.created_at) {
        return false;
      }

      const createdAt = Date.parse(row.created_at);
      if (Number.isNaN(createdAt)) {
        return false;
      }

      const phaseDays = row.bootstrapping_phase_days ?? 7;
      return Date.now() < createdAt + phaseDays * 24 * 60 * 60 * 1000;
    },
    false,
  );
}
