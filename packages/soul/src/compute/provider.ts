export interface CostEstimate {
  dollars: number;
  tokens: number;
}

export interface TokenBudget {
  maxDollars?: number;
  maxTokens: number;
}

export interface SummarizeInput {
  conversation_summary?: string;
  diff: string;
  project_id: string;
}

export interface SummarizeResult {
  confidence: number;
  cue_drafts: Array<Record<string, unknown>>;
  source: 'hybrid' | 'llm' | 'local_heuristic';
  truncated?: boolean;
}

export interface ComputeProvider {
  readonly name: string;
  cost_estimate: (input: SummarizeInput) => CostEstimate;
  embed?: (texts: readonly string[]) => Promise<number[][]>;
  isAvailable: () => boolean;
  rerank?: (
    query: string,
    candidates: readonly Record<string, unknown>[],
  ) => Promise<readonly Record<string, unknown>[]>;
  summarize_diff: (
    input: SummarizeInput,
    budget: TokenBudget,
  ) => Promise<SummarizeResult>;
}
