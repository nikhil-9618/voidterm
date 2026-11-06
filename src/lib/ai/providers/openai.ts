import OpenAI from 'openai';
import { env } from '@/lib/env';
import type {
  AIProvider,
  ChatMessage,
  ProviderConfig,
  StreamChunk,
  TokenUsage,
} from '../types';

const MODELS = ['gpt-4o', 'gpt-4o-mini'];
const AI_GATEWAY_BASE_URL = 'https://ai-gateway.vercel.sh/v1';

function toOpenAIMessages(
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
  const directKey = env.OPENAI_API_KEY;
  // On Vercel Functions the fresh token is attached to the incoming request. The
  // environment variable is a build/local fallback and is not the runtime source.
  const gatewayToken = config.oidcToken ?? process.env.VERCEL_OIDC_TOKEN;
  const apiKey = directKey ?? gatewayToken;

  if (!apiKey) {
    throw new Error('OpenAI is not configured (OPENAI_API_KEY or Vercel AI Gateway).');
  }

  // On Vercel, prefer the project-scoped OIDC token over a long-lived OpenAI
  // key. The Gateway accepts the same OpenAI Chat Completions protocol, so the
  // provider implementation stays identical apart from the base URL and model
  // namespace. A direct key, when present, always takes precedence.
  const useGateway = !directKey;
  const client = new OpenAI({
    apiKey,
    ...(useGateway ? { baseURL: AI_GATEWAY_BASE_URL } : {}),
  });

  const completion = await client.chat.completions.create(
    {
      model: useGateway ? `openai/${config.model}` : config.model,
      messages: toOpenAIMessages(messages, config.systemPrompt),
      temperature: config.temperature,
      max_tokens: config.maxTokens,
      stream: true,
      stream_options: { include_usage: true },
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

export const openaiProvider: AIProvider = {
  id: 'openai',
  name: 'OpenAI',
  models: MODELS,
  stream,
};
