'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, MonitorSmartphone, ShieldOff, Trash2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

type SessionRow = {
  id: string;
  userAgent: string | null;
  ipAddress: string | null;
  createdAt: string;
  expiresAt: string;
  current: boolean;
};

function describeAgent(userAgent: string | null): string {
  if (!userAgent) return 'unknown client';
  const browser = /Edg\//.test(userAgent)
    ? 'Edge'
    : /Firefox\//.test(userAgent)
      ? 'Firefox'
      : /Chrome\//.test(userAgent)
        ? 'Chrome'
        : /Safari\//.test(userAgent)
          ? 'Safari'
          : /curl\//.test(userAgent)
            ? 'curl'
            : 'browser';
  const os = /Mac OS X/.test(userAgent)
    ? 'macOS'
    : /Windows/.test(userAgent)
      ? 'Windows'
      : /Android/.test(userAgent)
        ? 'Android'
        : /iPhone|iPad/.test(userAgent)
          ? 'iOS'
          : /Linux/.test(userAgent)
            ? 'Linux'
            : '';
  return os ? `${browser} · ${os}` : browser;
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function SessionsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [signingOutAll, setSigningOutAll] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/auth/sessions', { cache: 'no-store' });
      if (!response.ok) throw new Error('Could not load sessions');
      const data = (await response.json()) as { sessions: SessionRow[] };
      setSessions(data.sessions);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not load sessions');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  const handleRevoke = async (session: SessionRow) => {
    setBusyId(session.id);
    setError(null);
    try {
      const response = await fetch('/api/auth/sessions', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: session.id }),
      });
      if (!response.ok) throw new Error('Could not revoke that session');
      if (session.current) {
        router.push('/login');
        router.refresh();
        return;
      }
      setSessions((current) => current.filter((item) => item.id !== session.id));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not revoke that session');
    } finally {
      setBusyId(null);
    }
  };

  const handleLogoutAll = async () => {
    setSigningOutAll(true);
    setError(null);
    try {
      const response = await fetch('/api/auth/logout-all', { method: 'POST' });
      if (!response.ok) throw new Error('Could not sign out all sessions');
      router.push('/login');
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not sign out all sessions');
      setSigningOutAll(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl p-0">
        <DialogHeader className="border-b border-border p-5">
          <DialogTitle className="flex items-center gap-2">
            <MonitorSmartphone className="h-4 w-4 text-muted" />
            Active sessions
          </DialogTitle>
          <DialogDescription>
            Devices currently signed in to this account. Revoking a session takes effect
            immediately.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[320px] overflow-y-auto">
          {loading ? (
            <div className="flex items-center gap-2 p-6 text-sm text-muted">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading sessions…
            </div>
          ) : sessions.length === 0 ? (
            <div className="p-6 text-sm text-dim">No active sessions.</div>
          ) : (
            <ul className="divide-y divide-border">
              {sessions.map((session) => (
                <li key={session.id} className="flex items-start gap-3 p-4">
                  <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center border border-border bg-elevated">
                    <MonitorSmartphone className="h-3.5 w-3.5 text-muted" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium text-fg">
                        {describeAgent(session.userAgent)}
                      </span>
                      {session.current ? <Badge variant="accent">Current</Badge> : null}
                    </div>
                    <p className="mt-1 text-xs text-dim">
                      {session.ipAddress ?? 'IP unknown'} · Started {formatDate(session.createdAt)}
                    </p>
                    <p className="text-xs text-dim">Expires {formatDate(session.expiresAt)}</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => void handleRevoke(session)}
                    disabled={busyId === session.id}
                    title={session.current ? 'Revoke this session and sign out' : 'Revoke session'}
                  >
                    {busyId === session.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="h-3.5 w-3.5" />
                    )}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="space-y-3 border-t border-border p-4">
          {error ? <p className="text-xs text-danger">{error}</p> : null}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-dim">Sign out everywhere if a device is lost.</p>
            <Button
              variant="danger"
              size="sm"
              onClick={() => void handleLogoutAll()}
              disabled={signingOutAll}
            >
              {signingOutAll ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <ShieldOff className="h-3 w-3" />
              )}
              Sign out all
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
