'use client';

import { useCallback, useEffect, useState } from 'react';
import type { ConversationSummaryDTO } from '@/lib/dto';

type Snapshot = {
  conversations: ConversationSummaryDTO[];
  loading: boolean;
  error: string | null;
};

// A tiny module-level store keeps the sidebar, command palette, and chat view
// in sync without pulling in an extra data-fetching dependency.
let store: Snapshot = { conversations: [], loading: true, error: null };
const listeners = new Set<() => void>();
let inflight: Promise<void> | null = null;

function publish(partial: Partial<Snapshot>): void {
  store = { ...store, ...partial };
  for (const listener of listeners) listener();
}

async function load(force = false): Promise<void> {
  if (inflight && !force) return inflight;

  if (store.conversations.length === 0) {
    publish({ loading: true });
  }

  const task = (async () => {
    try {
      const response = await fetch('/api/conversations', { cache: 'no-store' });
      if (response.status === 401) {
        publish({ conversations: [], loading: false, error: null });
        return;
      }
      if (!response.ok) throw new Error(`Failed to load conversations (${response.status})`);
      const data = (await response.json()) as { conversations?: ConversationSummaryDTO[] };
      publish({ conversations: data.conversations ?? [], loading: false, error: null });
    } catch (caught) {
      publish({
        loading: false,
        error: caught instanceof Error ? caught.message : 'Failed to load conversations',
      });
    } finally {
      inflight = null;
    }
  })();

  inflight = task;
  await task;
}

type CreateInput = {
  title?: string;
  model?: string;
  systemPrompt?: string;
};

export function useConversations() {
  const [snapshot, setSnapshot] = useState<Snapshot>(store);

  useEffect(() => {
    const listener = () => setSnapshot(store);
    listeners.add(listener);
    listener();
    if (store.conversations.length === 0) {
      void load();
    }
    return () => {
      listeners.delete(listener);
    };
  }, []);

  const refresh = useCallback(async () => {
    await load(true);
  }, []);

  const createConversation = useCallback(async (input: CreateInput = {}) => {
    const response = await fetch('/api/conversations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    if (!response.ok) throw new Error('Could not create conversation');
    const data = (await response.json()) as { conversation: ConversationSummaryDTO };
    publish({
      conversations: [data.conversation, ...store.conversations],
      loading: false,
    });
    return data.conversation;
  }, []);

  const deleteConversation = useCallback(async (id: string) => {
    const response = await fetch(`/api/conversations/${id}`, { method: 'DELETE' });
    if (!response.ok) throw new Error('Could not delete conversation');
    publish({ conversations: store.conversations.filter((item) => item.id !== id) });
  }, []);

  const renameConversation = useCallback(async (id: string, title: string) => {
    const response = await fetch(`/api/conversations/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title }),
    });
    if (!response.ok) throw new Error('Could not rename conversation');
    publish({
      conversations: store.conversations.map((item) =>
        item.id === id ? { ...item, title } : item,
      ),
    });
  }, []);

  /** Full-text API search (titles + message content). */
  const search = useCallback(async (query: string): Promise<ConversationSummaryDTO[]> => {
    if (query.trim().length < 2) return [];
    try {
      const response = await fetch(
        `/api/conversations/search?q=${encodeURIComponent(query.trim())}`,
        { cache: 'no-store' },
      );
      if (!response.ok) return [];
      const data = (await response.json()) as { conversations?: ConversationSummaryDTO[] };
      return data.conversations ?? [];
    } catch {
      return [];
    }
  }, []);

  return {
    conversations: snapshot.conversations,
    loading: snapshot.loading,
    error: snapshot.error,
    refresh,
    createConversation,
    deleteConversation,
    renameConversation,
    search,
  };
}
