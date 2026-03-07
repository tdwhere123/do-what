import type {
  ComputeProvider,
  CostEstimate,
  SummarizeInput,
  SummarizeResult,
  TokenBudget,
} from './provider.js';

const DEFAULT_ANTHROPIC_BASE_URL = 'https://api.anthropic.com';
const DEFAULT_MODEL = 'claude-3-5-haiku-latest';
const INPUT_COST_PER_MILLION = 0.8;

interface OfficialApiResponse {
  content?: Array<{
    text?: string;
    type?: string;
  }>;
}

export interface OfficialApiClient {
  createEmbedding?: (texts: readonly string[]) => Promise<number[][]>;
  createMessage: (payload: Record<string, unknown>) => Promise<OfficialApiResponse | string>;
}

export interface OfficialApiComputeProviderOptions {
  apiKey?: string;
  baseUrl?: string;
  client?: OfficialApiClient;
  model?: string;
}

function estimateTokens(input: SummarizeInput): number {
  return Math.ceil(
    (input.diff.length + (input.conversation_summary?.length ?? 0)) / 4,
  );
}

function buildPrompt(input: SummarizeInput): string {
  const conversationSummary = input.conversation_summary?.trim();
  return [
    'Analyze this git diff and extract durable memory cues as JSON.',
    'Return only a JSON object with shape {"cue_drafts":[],"confidence":0-1,"source":"llm"}.',
    'Each cue draft should include gist, anchors, pointers, formation_kind, source, and optional track.',
    `project_id: ${input.project_id}`,
    conversationSummary ? `conversation_summary: ${conversationSummary}` : undefined,
    'git_diff:',
    input.diff,
  ]
    .filter((line) => line !== undefined)
    .join('\n');
}

function normalizeSummarizeResult(payload: unknown): SummarizeResult {
  const raw = typeof payload === 'string' ? JSON.parse(payload) as unknown : payload;
  if (!raw || typeof raw !== 'object') {
    return {
      confidence: 0,
      cue_drafts: [],
      source: 'llm',
    };
  }

  const record = raw as Record<string, unknown>;
  const cueDrafts = Array.isArray(record.cue_drafts)
    ? record.cue_drafts.filter(
        (draft): draft is Record<string, unknown> =>
          draft !== null && typeof draft === 'object' && !Array.isArray(draft),
      )
    : [];

  return {
    confidence:
      typeof record.confidence === 'number' && Number.isFinite(record.confidence)
        ? record.confidence
        : 0.5,
    cue_drafts: cueDrafts,
    source:
      record.source === 'hybrid' || record.source === 'local_heuristic' || record.source === 'llm'
        ? record.source
        : 'llm',
  };
}

async function createDefaultClient(
  apiKey: string,
  baseUrl: string,
): Promise<OfficialApiClient> {
  return {
    async createMessage(payload: Record<string, unknown>): Promise<OfficialApiResponse> {
      const response = await fetch(`${baseUrl}/v1/messages`, {
        body: JSON.stringify(payload),
        headers: {
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
          'x-api-key': apiKey,
        },
        method: 'POST',
      });
      if (!response.ok) {
        throw new Error(`Official API request failed: ${response.status}`);
      }
      return response.json() as Promise<OfficialApiResponse>;
    },
  };
}

export class OfficialApiComputeProvider implements ComputeProvider {
  readonly name = 'official-api';

  private readonly apiKey?: string;
  private readonly baseUrl: string;
  private client?: OfficialApiClient;
  private readonly model: string;

  constructor(options: OfficialApiComputeProviderOptions = {}) {
    this.apiKey = options.apiKey ?? process.env.ANTHROPIC_API_KEY;
    this.baseUrl = options.baseUrl ?? DEFAULT_ANTHROPIC_BASE_URL;
    this.client = options.client;
    this.model = options.model ?? DEFAULT_MODEL;
  }

  cost_estimate(input: SummarizeInput): CostEstimate {
    const tokens = estimateTokens(input);
    return {
      dollars: Number(((tokens / 1_000_000) * INPUT_COST_PER_MILLION).toFixed(6)),
      tokens,
    };
  }

  async embed(texts: readonly string[]): Promise<number[][]> {
    if (!this.client?.createEmbedding) {
      return [];
    }
    return this.client.createEmbedding(texts);
  }

  isAvailable(): boolean {
    return typeof this.apiKey === 'string' && this.apiKey.trim().length > 0;
  }

  async summarize_diff(
    input: SummarizeInput,
    budget: TokenBudget,
  ): Promise<SummarizeResult> {
    if (!this.apiKey) {
      throw new Error('Official API provider is not configured');
    }

    const client = await this.resolveClient();
    const response = await client.createMessage({
      max_tokens: Math.max(256, Math.min(budget.maxTokens, 4_000)),
      messages: [
        {
          content: buildPrompt(input),
          role: 'user',
        },
      ],
      model: this.model,
      temperature: 0,
    });
    const textPayload =
      typeof response === 'string'
        ? response
        : response.content?.find((item) => item.type === 'text')?.text ?? '{}';

    return normalizeSummarizeResult(textPayload);
  }

  private async resolveClient(): Promise<OfficialApiClient> {
    if (!this.client) {
      this.client = await createDefaultClient(this.apiKey ?? '', this.baseUrl);
    }
    return this.client;
  }
}

export {
  buildPrompt as buildOfficialApiPrompt,
  normalizeSummarizeResult as normalizeOfficialApiResult,
};
