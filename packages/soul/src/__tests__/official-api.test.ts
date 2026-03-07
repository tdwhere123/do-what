import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { CustomApiComputeProvider } from '../compute/custom-api.js';
import { OfficialApiComputeProvider } from '../compute/official-api.js';

describe('official-api provider', () => {
  it('parses structured JSON responses from the official provider client', async () => {
    const provider = new OfficialApiComputeProvider({
      apiKey: 'test-key',
      client: {
        async createMessage() {
          return {
            content: [
              {
                text: JSON.stringify({
                  confidence: 0.82,
                  cue_drafts: [
                    {
                      anchors: ['src', 'auth.ts'],
                      gist: 'Auth flow changed',
                      pointers: ['repo_path:src/auth.ts'],
                    },
                  ],
                  source: 'llm',
                }),
                type: 'text',
              },
            ],
          };
        },
      },
    });

    const result = await provider.summarize_diff(
      {
        diff: 'diff --git a/src/auth.ts b/src/auth.ts',
        project_id: 'proj-1',
      },
      { maxTokens: 500 },
    );

    assert.equal(provider.isAvailable(), true);
    assert.equal(result.cue_drafts.length, 1);
    assert.equal(result.confidence, 0.82);
    assert.equal(provider.cost_estimate({ diff: 'abc', project_id: 'proj-1' }).tokens > 0, true);
  });
});

describe('custom-api provider', () => {
  it('normalizes openai-compatible responses', async () => {
    const provider = new CustomApiComputeProvider({
      client: {
        async createMessage() {
          return {
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    confidence: 0.7,
                    cue_drafts: [
                      {
                        anchors: ['src', 'index.ts'],
                        gist: 'Entry point updated',
                        pointers: ['repo_path:src/index.ts'],
                      },
                    ],
                    source: 'llm',
                  }),
                },
              },
            ],
          };
        },
      },
      config: {
        api_key: 'custom-key',
        base_url: 'https://example.invalid/v1',
        provider_type: 'openai-compatible',
      },
    });

    const result = await provider.summarize_diff(
      {
        diff: 'diff --git a/src/index.ts b/src/index.ts',
        project_id: 'proj-2',
      },
      { maxTokens: 500 },
    );

    assert.equal(provider.isAvailable(), true);
    assert.equal(result.cue_drafts.length, 1);
    assert.equal(result.source, 'llm');
  });
});
