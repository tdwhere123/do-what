export type ProviderModelOption = {
  id: string;
  label: string;
};

export const PROVIDER_MODELS: Record<string, ProviderModelOption[]> = {
  openai: [
    { id: "gpt-4.1", label: "GPT-4.1" },
    { id: "gpt-4.1-mini", label: "GPT-4.1 Mini" },
    { id: "o3-mini", label: "o3-mini" },
  ],
  anthropic: [
    { id: "claude-opus-4-20260301", label: "Claude Opus 4" },
    { id: "claude-sonnet-4-20260301", label: "Claude Sonnet 4" },
  ],
  openrouter: [],
  google: [
    { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro" },
    { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
  ],
};

export function providerModels(providerId: string): ProviderModelOption[] {
  return PROVIDER_MODELS[providerId] ?? [];
}
