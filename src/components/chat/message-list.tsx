'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowDown } from 'lucide-react';
import type { ChatMessageView } from './types';
import { MessageBlock } from './message-block';

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
