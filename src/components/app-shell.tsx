'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Menu, PanelLeft, PanelRight, Plus, Search } from 'lucide-react';
import { BrandLogo } from '@/components/brand-logo';
import { Sidebar } from '@/components/sidebar';
import { ContextPanel } from '@/components/context-panel';
import { CommandPalette } from '@/components/command-palette';
import { SessionsDialog } from '@/components/sessions-dialog';
import {
  ChatWorkspaceProvider,
  useChatWorkspace,
  type WorkspaceUser,
} from '@/components/chat/workspace-provider';
import { ProviderDot } from '@/components/provider-dot';
import { Button } from '@/components/ui/button';
import { useMe } from '@/hooks/use-me';
import { useRecentsDrawer } from '@/hooks/use-recents-drawer';
import { useKeyboardShortcuts, type ShortcutDefinition } from '@/hooks/use-keyboard-shortcuts';
import { cn } from '@/lib/utils';

function Topbar({
  onOpenMobileSidebar,
  sidebarOpen,
  onToggleSidebar,
  onOpenPalette,
  contextOpen,
  onToggleContext,
}: {
  onOpenMobileSidebar: () => void;
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
  onOpenPalette: () => void;
  contextOpen: boolean;
  onToggleContext: () => void;
}) {
  const pathname = usePathname();
  const { conversation, modelSpec } = useChatWorkspace();
  const title = conversation?.title ?? (pathname === '/c/new' ? 'New chat' : 'Workspace');

  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border/80 bg-bg/85 px-3 backdrop-blur sm:px-4">
      <Button
        variant="ghost"
        size="icon-sm"
        className="lg:hidden"
        onClick={onOpenMobileSidebar}
        aria-label="Open sidebar"
      >
        <Menu className="h-4 w-4" />
      </Button>

      <Button
        variant="ghost"
        size="icon-sm"
        className="hidden lg:inline-flex"
        onClick={onToggleSidebar}
        aria-label="Toggle sidebar"
        aria-pressed={sidebarOpen}
      >
        <PanelLeft className="h-4 w-4" />
      </Button>

      <Link href="/c/new" aria-label="VOIDTERM new chat" className="flex items-center lg:hidden">
        <BrandLogo variant="mark" idPrefix="topbar" className="h-7 w-7" />
      </Link>

      <h1 className="min-w-0 truncate text-sm font-medium text-fg">{title}</h1>

      <div className="ml-auto flex items-center gap-1.5">
        <span className="hidden items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-[11px] text-muted sm:flex">
          <ProviderDot provider={modelSpec.provider} />
          <span className="max-w-[150px] truncate">{modelSpec.label}</span>
        </span>

        <Button
          variant="ghost"
          size="icon-sm"
          className="hidden xl:inline-flex"
          onClick={onToggleContext}
          aria-label="Toggle context panel"
          aria-pressed={contextOpen}
        >
          <PanelRight className="h-4 w-4" />
        </Button>

        <Link
          href="/c/new"
          aria-label="New chat"
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-elevated hover:text-fg lg:hidden"
        >
          <Plus className="h-4 w-4" />
        </Link>

        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onOpenPalette}
          aria-label="Search and commands"
        >
          <Search className="h-4 w-4" />
        </Button>
      </div>
    </header>
  );
}

export function AppShell({
  user,
  children,
}: {
  user: WorkspaceUser;
  children: ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [sessionsOpen, setSessionsOpen] = useState(false);
  const [contextOpen, setContextOpen] = useState(true);

  const { drawerRef, progress: recentsProgress, dragging: recentsDragging } =
    useRecentsDrawer(mobileSidebarOpen, setMobileSidebarOpen);

  // Navigation always dismisses the mobile drawer.
  useEffect(() => {
    setMobileSidebarOpen(false);
  }, [pathname]);

  // Bridge used by the Android wrapper's hardware back button. Returning true
  // means the page consumed the back gesture; false lets WebView navigate back.
  useEffect(() => {
    const bridge = window as Window & {
      __voidtermBack?: () => boolean;
      __voidtermOpenRecents?: () => void;
    };

    bridge.__voidtermBack = () => {
      if (mobileSidebarOpen) {
        setMobileSidebarOpen(false);
        return true;
      }
      if (paletteOpen) {
        setPaletteOpen(false);
        return true;
      }
      if (sessionsOpen) {
        setSessionsOpen(false);
        return true;
      }
      return false;
    };
    bridge.__voidtermOpenRecents = () => {
      setPaletteOpen(false);
      setMobileSidebarOpen(true);
    };

    return () => {
      delete bridge.__voidtermBack;
      delete bridge.__voidtermOpenRecents;
    };
  }, [mobileSidebarOpen, paletteOpen, sessionsOpen]);

  const { user: refreshedUser } = useMe({
    ...user,
    avatarUrl: null,
    createdAt: new Date().toISOString(),
    lastLoginAt: null,
  });
  const activeUser: WorkspaceUser = refreshedUser
    ? {
        id: refreshedUser.id,
        email: refreshedUser.email,
        name: refreshedUser.name,
        tier: refreshedUser.tier,
      }
    : user;

  const shortcuts = useMemo<ShortcutDefinition[]>(
    () => [
      {
        key: 'k',
        meta: true,
        allowInInput: true,
        handler: () => setPaletteOpen((current) => !current),
      },
      {
        key: '/',
        meta: true,
        allowInInput: true,
        handler: () => {
          setPaletteOpen(false);
          setMobileSidebarOpen(false);
          router.push('/c/new');
        },
      },
      {
        key: 'b',
        meta: true,
        allowInInput: false,
        handler: () => setSidebarOpen((current) => !current),
      },
      {
        key: 'b',
        meta: true,
        shift: true,
        allowInInput: false,
        handler: () => setContextOpen((current) => !current),
      },
      {
        key: 'escape',
        allowInInput: true,
        handler: () => {
          setPaletteOpen(false);
          setMobileSidebarOpen(false);
        },
      },
    ],
    [router],
  );

  useKeyboardShortcuts(shortcuts);

  return (
    <ChatWorkspaceProvider user={activeUser}>
      <div className="flex h-[100dvh] w-full overflow-hidden bg-bg">
        <aside
          className={cn(
            'relative hidden h-full shrink-0 overflow-hidden border-r border-border bg-panel transition-[width] duration-200 lg:block',
            sidebarOpen ? 'w-[264px]' : 'w-0 border-r-0',
          )}
          aria-hidden={!sidebarOpen}
        >
          <div className="h-full w-[264px]">
            <Sidebar onManageSessions={() => setSessionsOpen(true)} />
          </div>
        </aside>

        {recentsProgress > 0 ? (
          <div
            className="fixed inset-0 z-50 lg:hidden"
            role="dialog"
            aria-modal="true"
            aria-label="Recent conversations"
          >
            <button
              type="button"
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              style={{ opacity: recentsProgress }}
              onClick={() => setMobileSidebarOpen(false)}
              aria-label="Close recents"
            />
            <aside
              ref={drawerRef}
              className={cn(
                'relative flex h-full w-[86vw] max-w-[340px] flex-col overflow-hidden rounded-r-3xl border-r border-border bg-panel shadow-panel',
                recentsDragging ? '' : 'transition-transform duration-200 ease-out',
              )}
              style={{ transform: `translateX(${(recentsProgress - 1) * 100}%)` }}
            >
              <Sidebar
                onNavigate={() => setMobileSidebarOpen(false)}
                onManageSessions={() => {
                  setMobileSidebarOpen(false);
                  setSessionsOpen(true);
                }}
                onClose={() => setMobileSidebarOpen(false)}
              />
            </aside>
          </div>
        ) : null}

        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar
            onOpenMobileSidebar={() => setMobileSidebarOpen(true)}
            sidebarOpen={sidebarOpen}
            onToggleSidebar={() => setSidebarOpen((current) => !current)}
            onOpenPalette={() => setPaletteOpen(true)}
            contextOpen={contextOpen}
            onToggleContext={() => setContextOpen((current) => !current)}
          />
          <main className="min-h-0 flex-1">{children}</main>
        </div>

        <ContextPanel open={contextOpen} onClose={() => setContextOpen(false)} />
      </div>

      <CommandPalette
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        onManageSessions={() => setSessionsOpen(true)}
        onToggleSidebar={() => setSidebarOpen((current) => !current)}
      />
      <SessionsDialog open={sessionsOpen} onOpenChange={setSessionsOpen} />
    </ChatWorkspaceProvider>
  );
}
