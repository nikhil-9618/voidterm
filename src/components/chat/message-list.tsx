'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import dynamic from 'next/dynamic';
import { ArrowDown } from 'lucide-react';
import type { ChatMessageView } from './types';

// Markdown parsing and syntax highlighting are only needed once a conversation
// has messages. Keeping them out of the route's initial bundle makes a new chat
// (and the app shell) interactive before that code is fetched.
const MessageBlock = dynamic(
  () => import('./message-block').then((module) => module.MessageBlock),
  {
    loading: () => (
      <div className="mb-8 animate-pulse space-y-2" aria-hidden="true">
        <div className="h-4 w-28 rounded bg-elevated" />
        <div className="h-3 w-full rounded bg-elevated" />
        <div className="h-3 w-5/6 rounded bg-elevated" />
      </div>
    ),
  },
);

export function MessageList({
  messages,
  streamingId,
  onRegenerate,
  onEdit,
  emptyState,
}: {
  messages: ChatMessageView[];
  streamingId: string | null;
  onRegenerate?: (messageId: string) => void;
  onEdit?: (message: ChatMessageView) => void;
  emptyState: ReactNode;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [atBottom, setAtBottom] = useState(true);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'auto') => {
    const element = containerRef.current;
    if (!element) return;
    element.scrollTo({ top: element.scrollHeight, behavior });
  }, []);

  useEffect(() => {
    if (atBottom) scrollToBottom(streamingId ? 'auto' : 'smooth');
  }, [messages, streamingId, atBottom, scrollToBottom]);

  const handleScroll = useCallback(() => {
    const element = containerRef.current;
    if (!element) return;
    const distanceFromBottom =
      element.scrollHeight - element.scrollTop - element.clientHeight;
    setAtBottom(distanceFromBottom < 96);
  }, []);

  if (messages.length === 0) {
    return <div className="min-h-0 flex-1 overflow-y-auto">{emptyState}</div>;
  }

  return (
    <div className="relative min-h-0 flex-1">
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="h-full overflow-y-auto overscroll-contain"
        role="log"
        aria-live="polite"
        aria-label="Conversation messages"
      >
        <div className="mx-auto w-full max-w-3xl px-5 py-8">
          {messages.map((message) => (
            <MessageBlock
              key={message.id}
              message={message}
              streaming={streamingId === message.id}
              onRegenerate={onRegenerate}
              onEdit={onEdit}
            />
          ))}
          <div className="h-4" aria-hidden="true" />
        </div>
      </div>

      {!atBottom ? (
        <button
          type="button"
          onClick={() => {
            setAtBottom(true);
            scrollToBottom('smooth');
          }}
          className="absolute bottom-4 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1.5 rounded-full border border-border bg-panel px-3 py-1.5 text-xs text-muted shadow-panel transition-colors hover:text-fg"
        >
          <ArrowDown className="h-3.5 w-3.5" />
          Latest
        </button>
      ) : null}
    </div>
  );
}
