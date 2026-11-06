import { env } from '@/lib/env';
import type {
  AIProvider,
  ChatMessage,
  ProviderConfig,
  StreamChunk,
  TokenUsage,
} from '../types';

const MODELS = ['llama3.3', 'qwen2.5', 'mistral'];

type OllamaLine = {
  message?: { role?: string; content?: string };
  done?: boolean;
  prompt_eval_count?: number;
  eval_count?: number;
  error?: string;
};

async function* stream(
  messages: ChatMessage[],
  config: ProviderConfig,
): AsyncGenerator<StreamChunk> {
  const baseUrl = (env.OLLAMA_URL ?? 'http://localhost:11434').replace(/\/$/, '');

  const payloadMessages: ChatMessage[] = config.systemPrompt
    ? [{ role: 'system', content: config.systemPrompt }, ...messages]
    : messages;

  let response: Response;
  try {
    response = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: config.model,
        messages: payloadMessages,
        stream: true,
        options: {
          temperature: config.temperature,
          num_predict: config.maxTokens,
        },
      }),
      signal: config.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw error;
    // Ollama is a local-only provider; a missing daemon is an expected state,
    // not an exceptional failure. The fallback layer can try a hosted provider.
    yield { type: 'error', error: 'Ollama not running — local-only provider' };
    return;
  }

  if (!response.ok) {
    yield { type: 'error', error: `Ollama request failed (${response.status})` };
    return;
  }

  if (!response.body) {
    yield { type: 'error', error: 'Ollama returned an empty response body' };
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let usage: TokenUsage | undefined;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line) continue;

        let parsed: OllamaLine;
        try {
          // Ollama streams newline-delimited JSON, not SSE.
          parsed = JSON.parse(line) as OllamaLine;
        } catch {
          continue;
        }

        if (parsed.error) {
          yield { type: 'error', error: parsed.error };
          return;
        }

        const content = parsed.message?.content;
        if (content) {
          yield { type: 'token', token: content };
        }

        if (parsed.done) {
          usage = {
            promptTokens: parsed.prompt_eval_count,
            completionTokens: parsed.eval_count,
            totalTokens:
              typeof parsed.prompt_eval_count === 'number' &&
              typeof parsed.eval_count === 'number'
                ? parsed.prompt_eval_count + parsed.eval_count
                : undefined,
          };
        }
      }
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }

  yield { type: 'done', usage };
}

export const ollamaProvider: AIProvider = {
  id: 'ollama',
  name: 'Ollama',
  models: MODELS,
  stream,
};
