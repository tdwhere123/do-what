import type {
  ComputeProvider,
  CostEstimate,
  SummarizeInput,
  SummarizeResult,
  TokenBudget,
} from './provider.js';
import {
  buildOfficialApiPrompt,
  normalizeOfficialApiResult,
} from './official-api.js';

const DEFAULT_OPENAI_BASE_URL = 'https://api.openai.com/v1';
const DEFAULT_OPENAI_MODEL = 'gpt-4o-mini';

export interface CustomApiComputeProviderConfig {
  api_key?: string;
  base_url?: string;
  extra_headers?: Record<string, string>;
  model?: string;
  provider_type?: 'anthropic-compatible' | 'openai-compatible';
}

export interface CustomApiClient {
  createEmbedding?: (texts: readonly string[]) => Promise<number[][]>;
  createMessage: (payload: Record<string, unknown>) => Promise<unknown>;
}

export interface CustomApiComputeProviderOptions {
  client?: CustomApiClient;
  config?: CustomApiComputeProviderConfig;
}

function estimateTokens(input: SummarizeInput): number {
  return Math.ceil(
    (input.diff.length + (input.conversation_summary?.length ?? 0)) / 4,
  );
}

async function createAnthropicCompatibleClient(
  config: Required<Pick<CustomApiComputeProviderConfig, 'api_key' | 'base_url'>>,
  extraHeaders: Record<string, string>,
): Promise<CustomApiClient> {
  return {
    async createMessage(payload: Record<string, unknown>): Promise<unknown> {
      const response = await fetch(`${config.base_url.replace(/\/$/, '')}/v1/messages`, {
        body: JSON.stringify(payload),
        headers: {
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
          'x-api-key': config.api_key,
          ...extraHeaders,
        },
        method: 'POST',
      });
      if (!response.ok) {
        throw new Error(`Custom anthropic-compatible request failed: ${response.status}`);
      }
      return response.json() as Promise<unknown>;
    },
  };
}

async function createOpenAiCompatibleClient(
  config: Required<Pick<CustomApiComputeProviderConfig, 'api_key' | 'base_url'>>,
  extraHeaders: Record<string, string>,
): Promise<CustomApiClient> {
  return {
    async createMessage(payload: Record<string, unknown>): Promise<unknown> {
      const response = await fetch(
        `${config.base_url.replace(/\/$/, '')}/chat/completions`,
        {
          body: JSON.stringify(payload),
          headers: {
            authorization: `Bearer ${config.api_key}`,
            'content-type': 'application/json',
            ...extraHeaders,
          },
          method: 'POST',
        },
      );
      if (!response.ok) {
        throw new Error(`Custom openai-compatible request failed: ${response.status}`);
      }
      return response.json() as Promise<unknown>;
    },
  };
}

function normalizeCustomResult(payload: unknown): SummarizeResult {
  if (payload && typeof payload === 'object') {
    const record = payload as Record<string, unknown>;
    if (Array.isArray(record.choices)) {
      const firstChoice = record.choices[0] as
        | {
            message?: {
              content?: string;
            };
          }
        | undefined;
      return normalizeOfficialApiResult(firstChoice?.message?.content ?? '{}');
    }
  }

  return normalizeOfficialApiResult(payload);
}

export class CustomApiComputeProvider implements ComputeProvider {
  readonly name = 'custom-api';

  private client?: CustomApiClient;
  private readonly config: Required<
    Pick<CustomApiComputeProviderConfig, 'api_key' | 'base_url' | 'provider_type'>
  > & Pick<CustomApiComputeProviderConfig, 'extra_headers' | 'model'>;

  constructor(options: CustomApiComputeProviderOptions = {}) {
    const config = options.config ?? {};
    this.client = options.client;
    this.config = {
      api_key: config.api_key ?? '',
      base_url: config.base_url ?? DEFAULT_OPENAI_BASE_URL,
      extra_headers: config.extra_headers,
      model: config.model ?? DEFAULT_OPENAI_MODEL,
      provider_type: config.provider_type ?? 'openai-compatible',
    };
  }

  cost_estimate(input: SummarizeInput): CostEstimate {
    const tokens = estimateTokens(input);
    return {
      dollars: Number(((tokens / 1_000_000) * 0.5).toFixed(6)),
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
    return this.config.api_key.trim().length > 0 && this.config.base_url.trim().length > 0;
  }

  async summarize_diff(
    input: SummarizeInput,
    budget: TokenBudget,
  ): Promise<SummarizeResult> {
    const client = await this.resolveClient();
    const prompt = buildOfficialApiPrompt(input);
    const payload = this.config.provider_type === 'anthropic-compatible'
      ? {
          max_tokens: Math.max(256, Math.min(budget.maxTokens, 4_000)),
          messages: [{ content: prompt, role: 'user' }],
          model: this.config.model,
          temperature: 0,
        }
      : {
          messages: [
            {
              content: prompt,
              role: 'user',
            },
          ],
          model: this.config.model,
          response_format: {
            type: 'json_object',
          },
          temperature: 0,
        };
    const response = await client.createMessage(payload);
    return normalizeCustomResult(response);
  }

  private async resolveClient(): Promise<CustomApiClient> {
    if (this.client) {
      return this.client;
    }

    const baseConfig = {
      api_key: this.config.api_key,
      base_url: this.config.base_url,
    };
    const extraHeaders = this.config.extra_headers ?? {};
    this.client = this.config.provider_type === 'anthropic-compatible'
      ? await createAnthropicCompatibleClient(baseConfig, extraHeaders)
      : await createOpenAiCompatibleClient(baseConfig, extraHeaders);
    return this.client;
  }
}
