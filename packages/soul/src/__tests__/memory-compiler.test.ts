import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { afterEach, describe, it } from 'node:test';
import { CompilerTrigger } from '../compiler/compiler-trigger.js';
import { MemoryCompiler } from '../compiler/memory-compiler.js';
import { DailyBudget } from '../compute/daily-budget.js';
import type { ComputeProvider, SummarizeInput, SummarizeResult, TokenBudget } from '../compute/provider.js';
import { ComputeProviderRegistry } from '../compute/registry.js';
import { LocalHeuristics } from '../compute/local-heuristics.js';
import { SoulStateStore } from '../db/soul-state-store.js';
import { SoulWorkerClient } from '../db/worker-client.js';
import { createReviewExecutor } from '../mcp/review-handler.js';
import { MemoryRepoManager } from '../repo/memory-repo-manager.js';
import { CueWriter } from '../write/cue-writer.js';
import { EdgeWriter } from '../write/edge-writer.js';
import { ProposalService } from '../write/proposal-service.js';
import { RepoCommitter } from '../write/repo-committer.js';
import { createSoulTestEnv, type SoulTestEnv } from './helpers.js';

class FakeProvider implements ComputeProvider {
  readonly name: string;
  calls = 0;
  private readonly available: boolean;
  private readonly estimate: { dollars: number; tokens: number };
  private readonly result: SummarizeResult;

  constructor(options: {
    available?: boolean;
    estimate?: { dollars: number; tokens: number };
    name: string;
    result: SummarizeResult;
  }) {
    this.available = options.available ?? true;
    this.estimate = options.estimate ?? { dollars: 0.1, tokens: 1_000 };
    this.name = options.name;
    this.result = options.result;
  }

  cost_estimate(_input: SummarizeInput) {
    return this.estimate;
  }

  isAvailable(): boolean {
    return this.available;
  }

  async summarize_diff(_input: SummarizeInput, _budget: TokenBudget): Promise<SummarizeResult> {
    this.calls += 1;
    return this.result;
  }
}

class FakeEventSubscriber {
  private readonly listeners = new Map<string, Set<(event: unknown) => void>>();

  emit(eventType: string, event: unknown): void {
    for (const listener of this.listeners.get(eventType) ?? []) {
      listener(event);
    }
  }

  off(eventType: string, listener: (event: unknown) => void): void {
    this.listeners.get(eventType)?.delete(listener);
  }

  on(eventType: string, listener: (event: unknown) => void): void {
    const listeners = this.listeners.get(eventType) ?? new Set<(event: unknown) => void>();
    listeners.add(listener);
    this.listeners.set(eventType, listeners);
  }
}

const activeEnvs: SoulTestEnv[] = [];
const activeManagers: MemoryRepoManager[] = [];
const activeWorkers: SoulWorkerClient[] = [];

function createCompilerHarness(options: {
  dailyBudgetLimits?: { maxDollars?: number; maxTokens?: number };
  llmProvider?: ComputeProvider;
} = {}) {
  const env = createSoulTestEnv();
  activeEnvs.push(env);
  const worker = new SoulWorkerClient(env.dbPath);
  activeWorkers.push(worker);
  const stateStore = new SoulStateStore(env.dbPath);
  const memoryRepoManager = new MemoryRepoManager({
    memoryRepoBasePath: env.memoryRepoBasePath,
    stateStore,
    workspaceRoot: env.workspaceRoot,
    writer: worker,
  });
  activeManagers.push(memoryRepoManager);
  const cueWriter = new CueWriter({ stateStore, writer: worker });
  const edgeWriter = new EdgeWriter({ stateStore, writer: worker });
  const proposalService = new ProposalService({ stateStore, writer: worker });
  const repoCommitter = new RepoCommitter({ memoryRepoManager });
  const reviewExecutor = createReviewExecutor({
    cueWriter,
    edgeWriter,
    proposalService,
    repoCommitter,
  });
  const dailyBudget = new DailyBudget({
    limits: options.dailyBudgetLimits,
    stateStore,
    writer: worker,
  });
  const providers: Array<{ priority: number; provider: ComputeProvider }> = [
    {
      priority: 0,
      provider: new LocalHeuristics(),
    },
  ];
  if (options.llmProvider) {
    providers.push({
      priority: 10,
      provider: options.llmProvider,
    });
  }
  const registry = new ComputeProviderRegistry({
    dailyBudget,
    providers,
  });
  return {
    compiler: new MemoryCompiler({
      dailyBudget,
      proposalService,
      registry,
      reviewExecutor,
      tokenBudget: { maxTokens: 2_000 },
    }),
    env,
  };
}

afterEach(async () => {
  while (activeManagers.length > 0) {
    const manager = activeManagers.pop();
    if (manager) {
      await manager.close();
    }
  }

  while (activeWorkers.length > 0) {
    const worker = activeWorkers.pop();
    if (worker) {
      await worker.close();
    }
  }

  while (activeEnvs.length > 0) {
    activeEnvs.pop()?.cleanup();
  }
});

describe('memory compiler', () => {
  it('writes working cues from local heuristics into memory_cues', async () => {
    const { compiler, env } = createCompilerHarness();

    const result = await compiler.compile({
      diff: `diff --git a/src/auth.ts b/src/auth.ts
--- a/src/auth.ts
+++ b/src/auth.ts
@@
+// TODO: improve auth caching
+export function authenticate() {
+  return true;
+}
`,
      projectId: 'proj-compiler',
    });

    assert.equal(result.providerName, 'local-heuristics');
    assert.equal(result.cueDrafts.length >= 2, true);

    const db = new Database(env.dbPath, { readonly: true });
    const rows = db
      .prepare(
        `SELECT source, impact_level
         FROM memory_cues
         WHERE project_id = ?
         ORDER BY created_at DESC`,
      )
      .all('proj-compiler') as Array<{ impact_level: string; source: string }>;
    db.close();

    assert.equal(rows.length >= 2, true);
    assert.equal(rows.every((row) => row.source === 'local_heuristic'), true);
    assert.equal(rows.every((row) => row.impact_level === 'working'), true);
  });

  it('skips llm providers when local heuristics find no cues', async () => {
    const llmProvider = new FakeProvider({
      name: 'custom-api',
      result: {
        confidence: 0.9,
        cue_drafts: [
          {
            gist: 'should not be used',
          },
        ],
        source: 'llm',
      },
    });
    const { compiler } = createCompilerHarness({
      llmProvider,
    });

    const result = await compiler.compile({
      diff: `diff --git a/src/index.ts b/src/index.ts
--- a/src/index.ts
+++ b/src/index.ts
@@
-import { auth } from './auth.js';
+import { auth } from './auth-service.js';
`,
      projectId: 'proj-empty',
    });

    assert.equal(result.skipped, true);
    assert.equal(llmProvider.calls, 0);
  });
});

describe('daily budget', () => {
  it('forces the compiler back to local heuristics when llm spend exceeds the remaining budget', async () => {
    const llmProvider = new FakeProvider({
      estimate: { dollars: 10, tokens: 50_000 },
      name: 'custom-api',
      result: {
        confidence: 0.9,
        cue_drafts: [
          {
            gist: 'LLM summary',
          },
        ],
        source: 'llm',
      },
    });
    const { compiler } = createCompilerHarness({
      dailyBudgetLimits: {
        maxDollars: 0.01,
        maxTokens: 10,
      },
      llmProvider,
    });

    const result = await compiler.compile({
      diff: `diff --git a/src/auth.ts b/src/auth.ts
--- a/src/auth.ts
+++ b/src/auth.ts
@@
+// TODO: budget test
+export function authenticate() {
+  return true;
+}
`,
      projectId: 'proj-budget',
    });

    assert.equal(result.providerName, 'local-heuristics');
    assert.equal(llmProvider.calls, 0);
  });
});

describe('compiler trigger', () => {
  it('rate-limits repeated compile triggers for the same project', async () => {
    const subscriber = new FakeEventSubscriber();
    const calls: string[] = [];
    const trigger = new CompilerTrigger({
      delayMs: 0,
      eventSubscriber: subscriber,
      loadCompletedRun: async (runId) => ({
        diff: `diff --git a/src/${runId}.ts b/src/${runId}.ts`,
        projectId: 'proj-trigger',
        runId,
      }),
      memoryCompiler: {
        async compile(input) {
          calls.push(input.projectId);
          return {
            confidence: 0.5,
            cueDrafts: [],
            proposalIds: [],
            providerName: 'local-heuristics',
            source: 'local_heuristic',
          };
        },
      },
      minIntervalMs: 60_000,
      now: (() => {
        let current = 100_000;
        return () => {
          current += 1;
          return current;
        };
      })(),
    });

    subscriber.emit('status:completed', { runId: 'run-a' });
    subscriber.emit('status:completed', { runId: 'run-b' });
    await new Promise((resolve) => {
      setTimeout(resolve, 20);
    });
    await trigger.close();

    assert.deepEqual(calls, ['proj-trigger']);
  });

  it('retries when completed run metadata is not ready yet', async () => {
    const subscriber = new FakeEventSubscriber();
    const calls: string[] = [];
    let attempts = 0;
    const trigger = new CompilerTrigger({
      delayMs: 0,
      eventSubscriber: subscriber,
      loadCompletedRun: async (runId) => {
        attempts += 1;
        if (attempts === 1) {
          return {
            diff: '',
            projectId: 'proj-retry',
            runId,
          };
        }
        return {
          diff: 'diff --git a/src/retry.ts b/src/retry.ts',
          projectId: 'proj-retry',
          runId,
        };
      },
      memoryCompiler: {
        async compile(input) {
          calls.push(input.projectId);
          return {
            confidence: 0.5,
            cueDrafts: [],
            proposalIds: [],
            providerName: 'local-heuristics',
            source: 'local_heuristic',
          };
        },
      },
      minIntervalMs: 60_000,
      now: (() => {
        let current = 100_000;
        return () => {
          current += 1;
          return current;
        };
      })(),
    });

    subscriber.emit('status:completed', { runId: 'run-retry' });
    await new Promise((resolve) => {
      setTimeout(resolve, 150);
    });
    await trigger.close();

    assert.equal(attempts >= 2, true);
    assert.deepEqual(calls, ['proj-retry']);
  });
});
