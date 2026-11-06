import type { AIProvider, ProviderId } from './types';
import { openaiProvider } from './providers/openai';
import { openrouterProvider } from './providers/openrouter';
import { groqProvider } from './providers/groq';
import { geminiProvider } from './providers/gemini';
import { deepseekProvider } from './providers/deepseek';
import { ollamaProvider } from './providers/ollama';

const registry: Record<ProviderId, AIProvider> = {
  openai: openaiProvider,
  openrouter: openrouterProvider,
  groq: groqProvider,
  gemini: geminiProvider,
  deepseek: deepseekProvider,
  ollama: ollamaProvider,
};

export function getProvider(id: ProviderId): AIProvider {
  const provider = registry[id];
  if (!provider) {
    throw new Error(`Unknown provider: ${id}`);
  }
  return provider;
}

export function listProviders(): AIProvider[] {
  return Object.values(registry);
}

export function providerModelIds(): string[] {
  return Object.values(registry).flatMap((provider) => provider.models);
}
