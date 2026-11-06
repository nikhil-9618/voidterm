import OpenAI from 'openai';
import { env } from '@/lib/env';
import type {
  AIProvider,
  ChatMessage,
  ProviderConfig,
  StreamChunk,
  TokenUsage,
} from '../types';

const MODELS = ['deepseek-chat', 'deepseek-reasoner'];

function toDeepSeekMessages(
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

type DeepSeekDelta = {
  content?: string | null;
  reasoning_content?: string | null;
};

async function* stream(
  messages: ChatMessage[],
  config: ProviderConfig,
): AsyncGenerator<StreamChunk> {
  const apiKey = env.DEEPSEEK_API_KEY;
  if (!apiKey) throw new Error('DEEPSEEK_API_KEY is not configured');

  const client = new OpenAI({
    apiKey,
    baseURL: 'https://api.deepseek.com/v1',
  });

  const completion = await client.chat.completions.create(
    {
      model: config.model,
      messages: toDeepSeekMessages(messages, config.systemPrompt),
      temperature: config.temperature,
      max_tokens: config.maxTokens,
      stream: true,
    },
    { signal: config.signal },
  );

  let usage: TokenUsage | undefined;

  for await (const chunk of completion) {
    const delta = chunk.choices[0]?.delta as DeepSeekDelta | undefined;

    // deepseek-reasoner emits chain-of-thought in `reasoning_content`. We only
    // forward the final answer (`content`) to the UI.
    if (delta?.reasoning_content) continue;

    if (delta?.content) {
      yield { type: 'token', token: delta.content };
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

export const deepseekProvider: AIProvider = {
  id: 'deepseek',
  name: 'DeepSeek',
  models: MODELS,
  stream,
};
