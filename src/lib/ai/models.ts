import type { ProviderId } from './types';

export type ModelSpec = {
  provider: ProviderId;
  model: string;
  label: string;
  contextK: number;
  /** 1 = slow, 5 = instant */
  speed: number;
  /** 1 = lightweight, 5 = frontier */
  quality: number;
  /** USD per 1K output tokens. */
  costPer1kOut: number;
  blurb: string;
};

export const MODELS: ModelSpec[] = [
  {
    provider: 'openrouter',
    model: 'openrouter/free',
    label: 'OpenRouter Free',
    contextK: 200,
    speed: 4,
    quality: 4,
    costPer1kOut: 0,
    blurb: 'No-card free-model router. Rate-limited, with automatic free-model selection.',
  },
  {
    provider: 'openrouter',
    model: 'google/gemma-4-31b-it:free',
    label: 'Gemma 4 31B (free)',
    contextK: 262,
    speed: 5,
    quality: 3,
    costPer1kOut: 0,
    blurb: 'Google Gemma 4 through OpenRouter. Free tier, no card.',
  },
  {
    provider: 'openai',
    model: 'gpt-4o',
    label: 'GPT-4o',
    contextK: 128,
    speed: 3,
    quality: 5,
    costPer1kOut: 0.01,
    blurb: 'Frontier multimodal reasoning. Highest quality, highest cost.',
  },
  {
    provider: 'openai',
    model: 'gpt-4o-mini',
    label: 'GPT-4o mini',
    contextK: 128,
    speed: 5,
    quality: 4,
    costPer1kOut: 0.0006,
    blurb: 'Fast, cheap generalist. The default daily driver.',
  },
  {
    provider: 'groq',
    model: 'llama-3.3-70b-versatile',
    label: 'Llama 3.3 70B',
    contextK: 128,
    speed: 5,
    quality: 4,
    costPer1kOut: 0.00059,
    blurb: 'Groq LPU inference. Absurd throughput for long code passes.',
  },
  {
    provider: 'groq',
    model: 'llama-3.1-8b-instant',
    label: 'Llama 3.1 8B',
    contextK: 128,
    speed: 5,
    quality: 2,
    costPer1kOut: 0.00008,
    blurb: 'Classification-grade speed. Also powers intent routing.',
  },
  {
    provider: 'gemini',
    model: 'gemini-3.8-flash',
    label: 'Gemini 3.8 Flash',
    contextK: 1048,
    speed: 5,
    quality: 5,
    costPer1kOut: 0.00375,
    blurb: 'Free-tier available in AI Studio. Strong reasoning and long context.',
  },
  {
    provider: 'gemini',
    model: 'gemini-3.5-flash-lite',
    label: 'Gemini 3.5 Flash-Lite',
    contextK: 1048,
    speed: 5,
    quality: 3,
    costPer1kOut: 0.0025,
    blurb: 'Free-tier available. Fast, lightweight Gemini for high-volume turns.',
  },
  {
    provider: 'deepseek',
    model: 'deepseek-chat',
    label: 'DeepSeek V3',
    contextK: 128,
    speed: 4,
    quality: 4,
    costPer1kOut: 0.0011,
    blurb: 'Strong coding model at commodity pricing.',
  },
  {
    provider: 'deepseek',
    model: 'deepseek-reasoner',
    label: 'DeepSeek R1',
    contextK: 64,
    speed: 2,
    quality: 5,
    costPer1kOut: 0.00219,
    blurb: 'Explicit reasoning traces (hidden here). Slow but deliberate.',
  },
  {
    provider: 'ollama',
    model: 'llama3.3',
    label: 'Llama 3.3 (local)',
    contextK: 128,
    speed: 2,
    quality: 4,
    costPer1kOut: 0,
    blurb: 'Local inference via Ollama. Zero data leaves your machine.',
  },
  {
    provider: 'ollama',
    model: 'qwen2.5',
    label: 'Qwen 2.5 (local)',
    contextK: 32,
    speed: 3,
    quality: 3,
    costPer1kOut: 0,
    blurb: 'Local Qwen. Good multilingual + code performance.',
  },
  {
    provider: 'ollama',
    model: 'mistral',
    label: 'Mistral (local)',
    contextK: 32,
    speed: 4,
    quality: 2,
    costPer1kOut: 0,
    blurb: 'Tiny local model. Quick drafts and offline work.',
  },
];

export const DEFAULT_MODEL = 'openrouter/free';

export const PROVIDER_META: Record<
  ProviderId,
  { name: string; short: string; color: string; description: string }
> = {
  openai: {
    name: 'OpenAI',
    short: 'OAI',
    color: '#10A37F',
    description: 'GPT-4o family. Strong general reasoning and tool use.',
  },
  openrouter: {
    name: 'OpenRouter',
    short: 'OR',
    color: '#6D5EF9',
    description: 'No-card free-model router. Rate-limited but independent of Gemini billing.',
  },
  groq: {
    name: 'Groq',
    short: 'GRQ',
    color: '#F55036',
    description: 'Llama on LPUs. Extreme tokens/second.',
  },
  gemini: {
    name: 'Google Gemini',
    short: 'GEM',
    color: '#4285F4',
    description: 'Free-tier available in AI Studio. Strong reasoning and long context.',
  },
  deepseek: {
    name: 'DeepSeek',
    short: 'DSK',
    color: '#4D6BFE',
    description: 'Coding-focused models with reasoning variants.',
  },
  ollama: {
    name: 'Ollama',
    short: 'LOC',
    color: '#8B98A9',
    description: 'Local-only runtime. Requires Ollama on localhost.',
  },
};

/** Ordered fallback chain (primary first, then the specified order). */
export const FALLBACK_ORDER: ProviderId[] = ['openrouter', 'gemini', 'groq', 'deepseek', 'openai'];

/** A valid model for each provider when the selected model belongs to another provider. */
export const FALLBACK_MODEL_BY_PROVIDER: Record<ProviderId, string> = {
  openai: 'gpt-4o-mini',
  openrouter: 'openrouter/free',
  groq: 'llama-3.3-70b-versatile',
  gemini: 'gemini-3.8-flash',
  deepseek: 'deepseek-chat',
  ollama: 'llama3.3',
};

export function getModelSpec(model: string): ModelSpec | undefined {
  return MODELS.find((spec) => spec.model === model);
}

export function isSupportedModel(model: string): boolean {
  return MODELS.some((spec) => spec.model === model);
}

export function providerForModel(model: string): ProviderId | undefined {
  return getModelSpec(model)?.provider;
}

export function modelLabel(model: string): string {
  return getModelSpec(model)?.label ?? model;
}

export function estimateCost(model: string, outputTokens?: number): number {
  const spec = getModelSpec(model);
  if (!spec || !outputTokens || outputTokens <= 0) return 0;
  return (outputTokens / 1_000) * spec.costPer1kOut;
}

export const MODELS_BY_PROVIDER = MODELS.reduce<Record<string, ModelSpec[]>>((acc, spec) => {
  const existing = acc[spec.provider] ?? [];
  existing.push(spec);
  acc[spec.provider] = existing;
  return acc;
}, {});
