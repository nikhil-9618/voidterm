import OpenAI from 'openai';
import { env } from '@/lib/env';
import type {
  AIProvider,
  ChatMessage,
  ProviderConfig,
  StreamChunk,
  TokenUsage,
} from '../types';

const MODELS = ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant'];

function toGroqMessages(
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
  const apiKey = env.GROQ_API_KEY;
  if (!apiKey) throw new Error('GROQ_API_KEY is not configured');

  const client = new OpenAI({
    apiKey,
    baseURL: 'https://api.groq.com/openai/v1',
  });

  const completion = await client.chat.completions.create(
    {
      model: config.model,
      messages: toGroqMessages(messages, config.systemPrompt),
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

export const groqProvider: AIProvider = {
  id: 'groq',
  name: 'Groq',
  models: MODELS,
  stream,
};
