'use client';

import { useEffect, useRef, useState } from 'react';
import type * as React from 'react';
import { useRouter } from 'next/navigation';
import {
  Download,
  Home,
  LogOut,
  MessageSquare,
  MonitorSmartphone,
  Moon,
  PanelLeft,
  Plus,
  ShieldOff,
  type LucideIcon,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import { Kbd } from '@/components/ui/kbd';
import { useChatWorkspace } from '@/components/chat/workspace-provider';
import { useConversations } from '@/hooks/use-conversations';
import type { ConversationSummaryDTO } from '@/lib/dto';
import { isLightTheme, toggleTheme } from '@/lib/theme';
import { cn, formatRelativeTime } from '@/lib/utils';

type PaletteItem = {
  id: string;
  type: 'action' | 'conversation';
  label: string;
  hint?: string;
  kbd?: string;
  icon: LucideIcon;
  run: () => void;
};

/**
 * Inline fuzzy matcher — subsequence match with bonuses for contiguous runs and
 * word starts. No external dependency, deterministic ordering.
 */
function fuzzyScore(query: string, text: string): number | null {
  const needle = query.trim().toLowerCase();
  if (!needle) return 0;

  const haystack = text.toLowerCase();
  let score = 0;
  let cursor = 0;
  let previousIndex = -2;

  for (const character of needle) {
    if (character === ' ') continue;
    const found = haystack.indexOf(character, cursor);
    if (found === -1) return null;

    score += 1;
    if (found === previousIndex + 1) score += 3;
    if (found === 0 || haystack[found - 1] === ' ' || haystack[found - 1] === '/') score += 2;

    previousIndex = found;
    cursor = found + 1;
  }

  return score;
}

export function CommandPalette({
  open,
  onOpenChange,
  onManageSessions,
  onToggleSidebar,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onManageSessions: () => void;
  onToggleSidebar: () => void;
}) {
  const router = useRouter();
  const { conversation } = useChatWorkspace();
  const { conversations, search } = useConversations();

  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [remote, setRemote] = useState<ConversationSummaryDTO[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);

  useEffect(() => {
    if (open) {
      setQuery('');
      setActive(0);
      setRemote([]);
      window.setTimeout(() => inputRef.current?.focus(), 20);
    }
  }, [open]);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setRemote([]);
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      const results = await search(trimmed);
      if (!cancelled) setRemote(results);
    }, 180);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query, search]);

  useEffect(() => {
    setActive(0);
  }, [query]);

  const close = () => onOpenChange(false);

  const actions: PaletteItem[] = [
    {
      id: 'new-chat',
      type: 'action',
      label: 'new chat',
      hint: 'start a fresh terminal session',
      kbd: '⌘/',
      icon: Plus,
      run: () => router.push('/c/new'),
    },
    {
      id: 'home',
      type: 'action',
      label: 'go to landing',
      hint: 'public terminal overview',
      icon: Home,
      run: () => router.push('/'),
    },
    {
      id: 'toggle-sidebar',
      type: 'action',
      label: 'toggle sidebar',
      hint: 'conversation history',
      kbd: '⌘B',
      icon: PanelLeft,
      run: onToggleSidebar,
    },
    {
      id: 'manage-sessions',
      type: 'action',
      label: 'manage sessions',
      hint: 'list and revoke devices',
      icon: MonitorSmartphone,
      run: onManageSessions,
    },
    {
      id: 'toggle-theme',
      type: 'action',
      label: isLightTheme() ? 'switch to dark mode' : 'switch to light mode',
      hint: 'theme preference',
      icon: Moon,
      run: () => {
        toggleTheme();
      },
    },
    ...(conversation
      ? [
          {
            id: 'export-current',
            type: 'action' as const,
            label: 'export current conversation',
            hint: conversation.title,
            icon: Download,
            run: () => {
              window.location.href = `/api/conversations/${conversation.id}/export?format=markdown`;
            },
          },
        ]
      : []),
    {
      id: 'logout',
      type: 'action',
      label: 'sign out',
      hint: 'revoke this device session',
      icon: LogOut,
      run: () => {
        void fetch('/api/auth/logout', { method: 'POST' }).finally(() => {
          router.push('/login');
          router.refresh();
        });
      },
    },
    {
      id: 'logout-all',
      type: 'action',
      label: 'sign out all devices',
      hint: 'revoke every session immediately',
      icon: ShieldOff,
      run: () => {
        void fetch('/api/auth/logout-all', { method: 'POST' }).finally(() => {
          router.push('/login');
          router.refresh();
        });
      },
    },
  ];

  const pool = new Map<string, ConversationSummaryDTO>();
  for (const item of conversations) pool.set(item.id, item);
  for (const item of remote) pool.set(item.id, item);

  const scoredActions = actions
    .map((action) => ({
      action,
      score: fuzzyScore(query, `${action.label} ${action.hint ?? ''}`),
    }))
    .filter((entry) => entry.score !== null)
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0));

  const scoredConversations = Array.from(pool.values())
    .map((item) => ({
      item,
      score: fuzzyScore(query, item.title),
    }))
    .filter((entry) => entry.score !== null)
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0));

  const conversationItems: PaletteItem[] = (
    query.trim() ? scoredConversations : scoredConversations.slice(0, 6)
  ).map(({ item }) => ({
    id: `conversation-${item.id}`,
    type: 'conversation',
    label: item.title,
    hint: `${item.model} · ${item.messageCount} msg · ${formatRelativeTime(item.updatedAt)}`,
    icon: MessageSquare,
    run: () => router.push(`/c/${item.id}`),
  }));

  const items: PaletteItem[] = [
    ...scoredActions.map((entry) => entry.action),
    ...conversationItems.slice(0, query.trim() ? 20 : 6),
  ];

  useEffect(() => {
    if (active > items.length - 1) setActive(Math.max(0, items.length - 1));
  }, [items.length, active]);

  useEffect(() => {
    itemRefs.current[active]?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const runItem = (item: PaletteItem | undefined) => {
    if (!item) return;
    close();
    item.run();
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive((current) => Math.min(items.length - 1, current + 1));
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((current) => Math.max(0, current - 1));
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      runItem(items[active]);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showClose={false}
        className="top-[12%] max-w-xl translate-y-0 gap-0 p-0"
        aria-describedby={undefined}
      >
        <DialogTitle className="sr-only">Command palette</DialogTitle>
        <DialogDescription className="sr-only">
          Search actions and conversations. Use arrow keys and Enter.
        </DialogDescription>

        <div className="flex items-center gap-2 border-b border-border px-3 py-3">
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search chats or run a command…"
            aria-label="Command palette search"
            className="w-full bg-transparent font-sans text-sm text-fg placeholder:text-dim focus:outline-none"
            autoComplete="off"
            spellCheck={false}
          />
          <Kbd>esc</Kbd>
        </div>

        <div className="max-h-[min(62vh,460px)] overflow-y-auto p-2">
          {items.length === 0 ? (
            <div className="px-3 py-8 text-center text-sm text-dim">
              No matching chats or commands
            </div>
          ) : (
            items.map((item, index) => {
              const showHeading =
                index === 0 || items[index - 1]?.type !== item.type;
              const isActive = index === active;

              return (
                <div key={item.id}>
                  {showHeading ? (
                    <p className="px-2 pb-1 pt-2 text-[11px] font-medium text-dim">
                      {item.type === 'action' ? 'Commands' : 'Chats'}
                    </p>
                  ) : null}
                  <button
                    ref={(node) => {
                      itemRefs.current[index] = node;
                    }}
                    type="button"
                    onClick={() => runItem(item)}
                    onMouseEnter={() => setActive(index)}
                    className={cn(
                      'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors',
                      isActive ? 'bg-elevated' : 'hover:bg-elevated/60',
                    )}
                  >
                    <item.icon
                      className={cn(
                        'h-3.5 w-3.5 shrink-0',
                        isActive ? 'text-accent' : 'text-dim',
                      )}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-fg">
                        {item.label}
                      </span>
                      {item.hint ? (
                        <span className="block truncate text-[11px] text-dim">
                          {item.hint}
                        </span>
                      ) : null}
                    </span>
                    {item.kbd ? <Kbd>{item.kbd}</Kbd> : null}
                  </button>
                </div>
              );
            })
          )}
        </div>

        <div className="flex items-center justify-between border-t border-border px-3 py-2 text-[11px] text-dim">
          <span className="flex items-center gap-2">
            <span className="flex items-center gap-1">
              <Kbd>↑</Kbd>
              <Kbd>↓</Kbd> navigate
            </span>
            <span className="flex items-center gap-1">
              <Kbd>↵</Kbd> run
            </span>
          </span>
          <span className="text-dim">VOIDTERM</span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
