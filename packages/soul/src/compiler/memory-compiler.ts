import type { SummarizeInput, SummarizeResult, TokenBudget } from '../compute/provider.js';
import { ComputeProviderRegistry } from '../compute/registry.js';
import type { DailyBudget } from '../compute/daily-budget.js';
import type { ProposalService } from '../write/proposal-service.js';
import type { ReviewExecutorRequest } from '../mcp/review-handler.js';
import type { ComputeProvider } from '../compute/provider.js';
import type { GitRenameDetector } from '../pointer/git-rename-detector.js';

class AutoAcceptQueue {
  private queue = Promise.resolve();

  enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const scheduled = this.queue.then(operation);
    this.queue = scheduled.then(() => undefined, () => undefined);
    return scheduled;
  }
}

export interface MemoryCompilerCompileInput {
  commitSha?: string;
  diff: string;
  projectId: string;
  summary?: string;
}

export interface MemoryCompilerResult {
  confidence: number;
  cueDrafts: Array<Record<string, unknown>>;
  proposalIds: string[];
  providerName: string;
  skipped?: boolean;
  source: 'hybrid' | 'llm' | 'local_heuristic';
  truncated?: boolean;
}

export interface MemoryCompilerOptions {
  dailyBudget?: DailyBudget;
  gitRenameDetector?: GitRenameDetector;
  registry: ComputeProviderRegistry;
  reviewExecutor: (request: ReviewExecutorRequest) => Promise<Record<string, unknown>>;
  proposalService: ProposalService;
  tokenBudget?: TokenBudget;
}

function normalizeCueDrafts(
  cueDrafts: readonly Record<string, unknown>[],
  providerName: string,
): Array<Record<string, unknown>> {
  const source = providerName === 'local-heuristics' ? 'local_heuristic' : 'llm';
  return cueDrafts.map((draft) => ({
    ...draft,
    source: typeof draft.source === 'string' ? draft.source : source,
  }));
}

export class MemoryCompiler {
  private readonly autoAcceptQueue = new AutoAcceptQueue();
  private readonly dailyBudget?: DailyBudget;
  private readonly gitRenameDetector?: GitRenameDetector;
  private readonly registry: ComputeProviderRegistry;
  private readonly reviewExecutor: MemoryCompilerOptions['reviewExecutor'];
  private readonly proposalService: ProposalService;
  private readonly tokenBudget: TokenBudget;

  constructor(options: MemoryCompilerOptions) {
    this.dailyBudget = options.dailyBudget;
    this.gitRenameDetector = options.gitRenameDetector;
    this.registry = options.registry;
    this.reviewExecutor = options.reviewExecutor;
    this.proposalService = options.proposalService;
    this.tokenBudget = options.tokenBudget ?? { maxTokens: 4_000 };
  }

  async compile(input: MemoryCompilerCompileInput): Promise<MemoryCompilerResult> {
    const summarizeInput: SummarizeInput = {
      conversation_summary: input.summary,
      diff: input.diff,
      project_id: input.projectId,
    };

    const localProvider = this.registry.getProvider('local-heuristics');
    const baselineProvider = localProvider ?? this.registry.getBestAvailable(summarizeInput);
    const baselineResult = await baselineProvider.summarize_diff(summarizeInput, this.tokenBudget);
    if (baselineResult.cue_drafts.length === 0) {
      await this.recordRenames(input);
      return {
        confidence: baselineResult.confidence,
        cueDrafts: [],
        proposalIds: [],
        providerName: baselineProvider.name,
        skipped: true,
        source: baselineResult.source,
        truncated: baselineResult.truncated,
      };
    }

    const provider = this.registry.getBestAvailable(summarizeInput);
    let result = baselineResult;
    let providerName = baselineProvider.name;

    if (provider.name !== baselineProvider.name) {
      result = await this.tryLlmProvider(provider, summarizeInput, baselineResult);
      providerName = result === baselineResult ? baselineProvider.name : provider.name;
    }

    await this.recordRenames(input);

    const cueDrafts = normalizeCueDrafts(result.cue_drafts, providerName);
    const proposalIds: string[] = [];
    for (const cueDraft of cueDrafts) {
      const confidence =
        typeof cueDraft.confidence === 'number' ? cueDraft.confidence : result.confidence;
      const proposal = await this.proposalService.propose({
        confidence,
        cue_draft: cueDraft,
        impact_level: 'working',
        project_id: input.projectId,
      });
      proposalIds.push(proposal.proposalId);
      await this.autoAcceptQueue.enqueue(() =>
        this.reviewExecutor({
          action: 'accept',
          proposalId: proposal.proposalId,
          resolver: 'auto',
        }),
      );
    }

    return {
      confidence: result.confidence,
      cueDrafts,
      proposalIds,
      providerName,
      source: result.source,
      truncated: result.truncated,
    };
  }

  private async recordRenames(input: MemoryCompilerCompileInput): Promise<void> {
    if (!this.gitRenameDetector) {
      return;
    }

    await this.gitRenameDetector.recordFromDiff({
      commitSha: input.commitSha,
      diff: input.diff,
      projectId: input.projectId,
    });
  }

  private async tryLlmProvider(
    provider: ComputeProvider,
    summarizeInput: SummarizeInput,
    fallbackResult: SummarizeResult,
  ): Promise<SummarizeResult> {
    const estimate = provider.cost_estimate(summarizeInput);
    if (this.dailyBudget && !this.dailyBudget.canSpend(estimate)) {
      return fallbackResult;
    }

    try {
      const result = await provider.summarize_diff(summarizeInput, this.tokenBudget);
      if (result.cue_drafts.length === 0) {
        return fallbackResult;
      }
      if (this.dailyBudget) {
        await this.dailyBudget.recordSpend(estimate);
      }
      return result;
    } catch (error) {
      console.warn(`[soul][compiler] provider ${provider.name} failed, falling back`, error);
      return fallbackResult;
    }
  }
}
