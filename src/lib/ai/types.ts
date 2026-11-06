export type ProviderId = 'openai' | 'openrouter' | 'groq' | 'gemini' | 'deepseek' | 'ollama';

export type ChatMessage = {
  role: 'user' | 'assistant' | 'system';
  content: string;
};

export type TokenUsage = {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
};

export type StreamChunk = {
  type: 'token' | 'done' | 'error';
  token?: string;
  error?: string;
  usage?: TokenUsage;
};

export type ProviderConfig = {
  model: string;
  temperature?: number;
  maxTokens?: number;
  systemPrompt?: string;
  /** Optional abort signal threaded from the HTTP request. */
  signal?: AbortSignal;
  /** Per-request Vercel OIDC token used by AI Gateway on Vercel Functions. */
  oidcToken?: string;
};

export type AIProvider = {
  id: ProviderId;
  name: string;
  models: string[];
  stream: (messages: ChatMessage[], config: ProviderConfig) => AsyncGenerator<StreamChunk>;
};
