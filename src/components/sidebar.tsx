'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Download,
  Loader2,
  LogOut,
  MonitorSmartphone,
  MoreHorizontal,
  PanelLeftClose,
  Plus,
  Search,
  Trash2,
} from 'lucide-react';
import { BrandLogo } from '@/components/brand-logo';
import { ThemeToggle } from '@/components/theme-toggle';
import { useConversations } from '@/hooks/use-conversations';
import { useChatWorkspace } from '@/components/chat/workspace-provider';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { ConversationSummaryDTO } from '@/lib/dto';
import { cn, formatRelativeTime } from '@/lib/utils';

type GroupKey = 'today' | 'yesterday' | 'week' | 'older';

const GROUP_LABELS: Record<GroupKey, string> = {
  today: 'Today',
  yesterday: 'Yesterday',
  week: 'Previous 7 days',
  older: 'Older',
};

function groupFor(iso: string): GroupKey {
  const date = new Date(iso);
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const time = date.getTime();

  if (time >= startOfToday) return 'today';
  if (time >= startOfToday - 86_400_000) return 'yesterday';
  if (time >= startOfToday - 7 * 86_400_000) return 'week';
  return 'older';
}

function ConversationRow({
  conversation,
  active,
  onNavigate,
  onDelete,
}: {
  conversation: ConversationSummaryDTO;
  active: boolean;
  onNavigate: () => void;
  onDelete: (id: string) => void;
}) {
  const router = useRouter();

  return (
    <div
      className={cn(
        'group relative rounded-xl transition-colors',
        active ? 'bg-elevated shadow-sm' : 'hover:bg-elevated/70',
      )}
    >
      {active ? (
        <span className="absolute bottom-2.5 left-0 top-2.5 w-0.5 rounded-full bg-accent" />
      ) : null}
      <button
        type="button"
        onClick={() => {
          router.push(`/c/${conversation.id}`);
          onNavigate();
        }}
        className="block w-full px-2.5 py-2 text-left"
        title={conversation.title}
      >
        <span
          className={cn(
            'block truncate pr-6 text-[13px]',
            active ? 'font-medium text-fg' : 'text-muted',
          )}
        >
          {conversation.title}
        </span>
        <span className="mt-0.5 block text-[11px] text-dim">
          {formatRelativeTime(conversation.updatedAt)}
        </span>
      </button>

      <div className="absolute right-1 top-1.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100 max-sm:opacity-100">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Actions for ${conversation.title}`}
            >
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuLabel>Conversation</DropdownMenuLabel>
            <DropdownMenuItem
              onSelect={() => {
                window.location.href = `/api/conversations/${conversation.id}/export?format=json`;
              }}
            >
              <Download className="h-3.5 w-3.5" /> Export JSON
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => {
                window.location.href = `/api/conversations/${conversation.id}/export?format=markdown`;
              }}
            >
              <Download className="h-3.5 w-3.5" /> Export Markdown
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={() => {
                if (window.confirm('Delete this conversation permanently?')) {
                  onDelete(conversation.id);
                }
              }}
              className="text-danger focus:text-danger"
            >
              <Trash2 className="h-3.5 w-3.5" /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

export function Sidebar({
  onNavigate,
  onManageSessions,
  onClose,
}: {
  onNavigate?: () => void;
  onManageSessions: () => void;
  onClose?: () => void;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { user } = useChatWorkspace();
  const { conversations, loading, error, search, deleteConversation } = useConversations();

  const [query, setQuery] = useState('');
  const [remoteResults, setRemoteResults] = useState<ConversationSummaryDTO[]>([]);
  const [searching, setSearching] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setRemoteResults([]);
      setSearching(false);
      return;
    }

    let cancelled = false;
    setSearching(true);
    const timer = window.setTimeout(async () => {
      const results = await search(trimmed);
      if (!cancelled) {
        setRemoteResults(results);
        setSearching(false);
      }
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query, search]);

  const filtered = useMemo(() => {
    const trimmed = query.trim().toLowerCase();
    if (!trimmed) return conversations;

    const merged = new Map<string, ConversationSummaryDTO>();
    for (const conversation of conversations) {
      if (conversation.title.toLowerCase().includes(trimmed)) {
        merged.set(conversation.id, conversation);
      }
    }
    for (const conversation of remoteResults) {
      merged.set(conversation.id, conversation);
    }
    return Array.from(merged.values());
  }, [conversations, remoteResults, query]);

  const grouped = useMemo(() => {
    const groups: Record<GroupKey, ConversationSummaryDTO[]> = {
      today: [],
      yesterday: [],
      week: [],
      older: [],
    };
    for (const conversation of filtered) {
      groups[groupFor(conversation.updatedAt)].push(conversation);
    }
    return groups;
  }, [filtered]);

  const handleDelete = async (id: string) => {
    setActionError(null);
    try {
      await deleteConversation(id);
      if (pathname === `/c/${id}`) {
        router.push('/c/new');
      }
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : 'Could not delete conversation');
    }
  };

  const handleLogout = async () => {
    setSigningOut(true);
    setActionError(null);
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      router.push('/login');
      router.refresh();
    } catch {
      setActionError('Could not sign out.');
      setSigningOut(false);
    }
  };

  return (
    <div className="sidebar-sheen flex h-full w-[264px] flex-col">
      <div className="flex h-14 items-center justify-between px-4">
        <Link
          href="/c/new"
          aria-label="VOIDTERM workspace"
          className="flex items-center"
          onClick={onNavigate}
        >
          <BrandLogo idPrefix="sidebar" className="h-7 w-auto" />
        </Link>

        {onClose ? (
          <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close sidebar">
            <PanelLeftClose className="h-4 w-4" />
          </Button>
        ) : null}
      </div>

      <div className="space-y-2.5 px-3 pb-4">
        <button
          type="button"
          onClick={() => {
            router.push('/c/new');
            onNavigate?.();
          }}
          className="group flex h-10 w-full items-center gap-2 rounded-xl bg-fg px-3 text-sm font-medium text-bg shadow-sm transition-all hover:opacity-90"
        >
          <Plus className="h-4 w-4 transition-transform group-hover:rotate-90" />
          New chat
        </button>

        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-dim" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search chats"
            aria-label="Search conversations"
            className="h-9 rounded-xl border-transparent bg-elevated/70 pl-8 pr-8 text-[13px] focus-visible:border-border-strong"
          />
          {searching ? (
            <Loader2 className="absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-dim" />
          ) : query ? (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-sm text-dim hover:text-fg"
            >
              ×
            </button>
          ) : null}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2">
        {error ? (
          <p className="px-2 py-2 text-xs text-danger">{error}</p>
        ) : loading && conversations.length === 0 ? (
          <div className="flex items-center gap-2 px-2 py-3 text-xs text-dim">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Loading chats
          </div>
        ) : filtered.length === 0 ? (
          <div className="px-2 py-8 text-center">
            <p className="text-[13px] font-medium text-muted">
              {query ? 'No chats found' : 'No conversations yet'}
            </p>
            <p className="mt-1 text-xs leading-relaxed text-dim">
              {query ? 'Try a different search.' : 'Your chats will appear here.'}
            </p>
          </div>
        ) : (
          (Object.keys(GROUP_LABELS) as GroupKey[]).map((key) => {
            const items = grouped[key];
            if (items.length === 0) return null;
            return (
              <div key={key} className="pb-2">
                <p className="px-2.5 pb-1.5 pt-3 text-[10px] font-medium uppercase tracking-[0.12em] text-dim">
                  {GROUP_LABELS[key]}
                </p>
                <div className="space-y-0.5">
                  {items.map((conversation) => (
                    <ConversationRow
                      key={conversation.id}
                      conversation={conversation}
                      active={pathname === `/c/${conversation.id}`}
                      onNavigate={() => onNavigate?.()}
                      onDelete={(id) => void handleDelete(id)}
                    />
                  ))}
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="border-t border-border p-3">
        {actionError ? <p className="mb-2 text-xs text-danger">{actionError}</p> : null}

        <div className="flex items-center gap-2.5 rounded-xl border border-border/70 bg-elevated/40 p-2">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent/10 text-xs font-semibold uppercase text-accent">
            {user.email.slice(0, 1)}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[12px] font-medium text-fg">
              {user.name || user.email}
            </span>
            <span className="block truncate text-[11px] text-dim">{user.email}</span>
          </span>
        </div>

        <div className="mt-2 flex items-center gap-0.5">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={onManageSessions}
                aria-label="Manage sessions"
              >
                <MonitorSmartphone className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Sessions</TooltipContent>
          </Tooltip>

          <ThemeToggle />

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => void handleLogout()}
                disabled={signingOut}
                aria-label="Sign out"
              >
                {signingOut ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <LogOut className="h-4 w-4" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>Sign out</TooltipContent>
          </Tooltip>
        </div>
      </div>
    </div>
  );
}
