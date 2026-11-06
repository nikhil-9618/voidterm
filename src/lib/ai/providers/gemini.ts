import { env } from '@/lib/env';
import type {
  AIProvider,
  ChatMessage,
  ProviderConfig,
  StreamChunk,
  TokenUsage,
} from '../types';

const MODELS = ['gemini-3.8-flash', 'gemini-3.5-flash-lite'];

type GeminiPayload = {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
  }>;
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    totalTokenCount?: number;
  };
};

function toGeminiContents(messages: ChatMessage[]) {
  return messages
    .filter((message) => message.role !== 'system')
    .map((message) => ({
      role: message.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: message.content }],
    }));
}

async function* stream(
  messages: ChatMessage[],
  config: ProviderConfig,
): AsyncGenerator<StreamChunk> {
  const apiKey = env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY is not configured');

  const model = encodeURIComponent(config.model);
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      // API key goes in a header, not the query string, so it cannot leak via
      // proxy logs or error messages.
      'x-goog-api-key': apiKey,
    },
    body: JSON.stringify({
      contents: toGeminiContents(messages),
      ...(config.systemPrompt
        ? { systemInstruction: { parts: [{ text: config.systemPrompt }] } }
        : {}),
      generationConfig: {
        temperature: config.temperature,
        maxOutputTokens: config.maxTokens,
      },
    }),
    signal: config.signal,
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(
      `Gemini request failed (${response.status})${detail ? `: ${detail.slice(0, 180)}` : ''}`,
    );
  }

  if (!response.body) throw new Error('Gemini returned an empty response body');

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
        if (!line.startsWith('data:')) continue;

        const data = line.slice(5).trim();
        if (!data || data === '[DONE]') continue;

        let payload: GeminiPayload;
        try {
          payload = JSON.parse(data) as GeminiPayload;
        } catch {
          continue;
        }

        const parts = payload.candidates?.[0]?.content?.parts ?? [];
        for (const part of parts) {
          if (typeof part.text === 'string' && part.text.length > 0) {
            yield { type: 'token', token: part.text };
          }
        }

        if (payload.usageMetadata) {
          usage = {
            promptTokens: payload.usageMetadata.promptTokenCount,
            completionTokens: payload.usageMetadata.candidatesTokenCount,
            totalTokens: payload.usageMetadata.totalTokenCount,
          };
        }
      }
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }

  yield { type: 'done', usage };
}

export const geminiProvider: AIProvider = {
  id: 'gemini',
  name: 'Google Gemini',
  models: MODELS,
  stream,
};
