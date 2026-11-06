'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { DEFAULT_MODEL, MODELS, getModelSpec, type ModelSpec } from '@/lib/ai/models';
import type { TokenUsage } from '@/lib/ai/types';

export type WorkspaceUser = {
  id: string;
  email: string;
  name: string | null;
  tier: number;
};

export type WorkspaceConversation = {
  id: string;
  title: string;
  model: string;
  systemPrompt: string | null;
} | null;

type WorkspaceContextValue = {
  user: WorkspaceUser;
  model: string;
  setModel: (model: string) => void;
  modelSpec: ModelSpec;
  systemPrompt: string;
  setSystemPrompt: (prompt: string) => void;
  usage: TokenUsage | null;
  setUsage: (usage: TokenUsage | null) => void;
  providerUsed: string | null;
  setProviderUsed: (provider: string | null) => void;
  conversation: WorkspaceConversation;
  setConversation: (conversation: WorkspaceConversation) => void;
  messageCount: number;
  setMessageCount: (count: number) => void;
};

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

// Bump this when the default provider changes so existing browsers do not keep
// restoring a card-gated model from localStorage.
const MODEL_STORAGE_KEY = 'voidterm-model-free-v2';

export function ChatWorkspaceProvider({
  user,
  children,
}: {
  user: WorkspaceUser;
  children: ReactNode;
}) {
  const [model, setModelState] = useState(DEFAULT_MODEL);
  const [systemPrompt, setSystemPrompt] = useState('');
  const [usage, setUsage] = useState<TokenUsage | null>(null);
  const [providerUsed, setProviderUsed] = useState<string | null>(null);
  const [conversation, setConversation] = useState<WorkspaceConversation>(null);
  const [messageCount, setMessageCount] = useState(0);

  // Restore the last chosen model without causing a hydration mismatch.
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(MODEL_STORAGE_KEY);
      if (stored && getModelSpec(stored)) setModelState(stored);
    } catch {
      // Private browsing / disabled storage: keep the default.
    }
  }, []);

  const setModel = useCallback((next: string) => {
    if (!getModelSpec(next)) return;
    setModelState(next);
    try {
      window.localStorage.setItem(MODEL_STORAGE_KEY, next);
    } catch {
      // Non-fatal.
    }
  }, []);

  const modelSpec = useMemo(() => getModelSpec(model) ?? MODELS[0], [model]);

  const value = useMemo<WorkspaceContextValue>(
    () => ({
      user,
      model,
      setModel,
      modelSpec,
      systemPrompt,
      setSystemPrompt,
      usage,
      setUsage,
      providerUsed,
      setProviderUsed,
      conversation,
      setConversation,
      messageCount,
      setMessageCount,
    }),
    [
      user,
      model,
      setModel,
      modelSpec,
      systemPrompt,
      usage,
      providerUsed,
      conversation,
      messageCount,
    ],
  );

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useChatWorkspace(): WorkspaceContextValue {
  const context = useContext(WorkspaceContext);
  if (!context) {
    throw new Error('useChatWorkspace must be used inside ChatWorkspaceProvider');
  }
  return context;
}
