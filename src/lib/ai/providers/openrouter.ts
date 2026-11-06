import OpenAI from 'openai';
import { env } from '@/lib/env';
import type {
  AIProvider,
  ChatMessage,
  ProviderConfig,
  StreamChunk,
  TokenUsage,
} from '../types';

const MODELS = ['openrouter/free', 'google/gemma-4-31b-it:free'];
const BASE_URL = 'https://openrouter.ai/api/v1';

function toOpenRouterMessages(
  messages: ChatMessage[],
  systemPrompt?: string,
): OpenAI.Chat.Completions.ChatCompletionMessageParam[] {
  const all: ChatMessage[] = systemPrompt
    ? [{ role: 'system', content: systemPrompt }, ...messages]
    : messages;

  return all.map((message) => {
    if (message.role === 'assistant') {
      return { role: 'assistant', content: message.content };
    }
    if (message.role === 'system') {
      return { role: 'system', content: message.content };
    }
    return { role: 'user', content: message.content };
  });
}

async function* stream(
  messages: ChatMessage[],
  config: ProviderConfig,
): AsyncGenerator<StreamChunk> {
  const apiKey = env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error('OPENROUTER_API_KEY is not configured');

  const client = new OpenAI({
    apiKey,
    baseURL: BASE_URL,
    defaultHeaders: {
      'HTTP-Referer': env.NEXT_PUBLIC_APP_URL,
      'X-Title': 'VOIDTERM',
    },
  });

  const completion = await client.chat.completions.create(
    {
      model: config.model,
      messages: toOpenRouterMessages(messages, config.systemPrompt),
      temperature: config.temperature,
      max_tokens: config.maxTokens,
      stream: true,
    },
    { signal: config.signal },
  );

  let usage: TokenUsage | undefined;

  for await (const chunk of completion) {
    const content = chunk.choices[0]?.delta?.content;
    if (content) {
      yield { type: 'token', token: content };
    }
    if (chunk.usage) {
      usage = {
        promptTokens: chunk.usage.prompt_tokens,
        completionTokens: chunk.usage.completion_tokens,
        totalTokens: chunk.usage.total_tokens,
      };
    }
  }

  yield { type: 'done', usage };
}

export const openrouterProvider: AIProvider = {
  id: 'openrouter',
  name: 'OpenRouter',
  models: MODELS,
  stream,
};
