'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Check,
  Copy,
  KeyRound,
  Loader2,
  MonitorSmartphone,
  ShieldCheck,
  ShieldOff,
  Trash2,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';

type SessionRow = {
  id: string;
  userAgent: string | null;
  ipAddress: string | null;
  createdAt: string;
  expiresAt: string;
  current: boolean;
};

type MfaStatus = {
  enabled: boolean;
  enabledAt: string | null;
  recoveryCodesRemaining: number;
};

type MfaSetup = {
  secret: string;
  otpauthUrl: string;
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

  const [mfa, setMfa] = useState<MfaStatus | null>(null);
  const [mfaLoading, setMfaLoading] = useState(false);
  const [mfaError, setMfaError] = useState<string | null>(null);
  const [setup, setSetup] = useState<MfaSetup | null>(null);
  const [setupCode, setSetupCode] = useState('');
  const [setupBusy, setSetupBusy] = useState(false);
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const [disableOpen, setDisableOpen] = useState(false);
  const [disableCode, setDisableCode] = useState('');
  const [disableBusy, setDisableBusy] = useState(false);
  const [copied, setCopied] = useState<'secret' | 'codes' | null>(null);

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

  const loadMfa = useCallback(async () => {
    setMfaLoading(true);
    setMfaError(null);
    try {
      const response = await fetch('/api/auth/mfa/status', { cache: 'no-store' });
      if (!response.ok) throw new Error('Could not load two-factor status');
      setMfa((await response.json()) as MfaStatus);
    } catch (caught) {
      setMfaError(caught instanceof Error ? caught.message : 'Could not load two-factor status');
    } finally {
      setMfaLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      void load();
      void loadMfa();
    }
  }, [open, load, loadMfa]);

  useEffect(() => {
    if (!open) {
      setSetup(null);
      setSetupCode('');
      setRecoveryCodes(null);
      setDisableOpen(false);
      setDisableCode('');
      setMfaError(null);
    }
  }, [open]);

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

  const startMfaSetup = async () => {
    setMfaLoading(true);
    setMfaError(null);
    try {
      const response = await fetch('/api/auth/mfa/setup', { method: 'POST' });
      const data = (await response.json().catch(() => ({}))) as MfaSetup & { message?: string };
      if (!response.ok) throw new Error(data.message ?? 'Could not start setup');
      setSetup({ secret: data.secret, otpauthUrl: data.otpauthUrl });
      setSetupCode('');
      setRecoveryCodes(null);
    } catch (caught) {
      setMfaError(caught instanceof Error ? caught.message : 'Could not start setup');
    } finally {
      setMfaLoading(false);
    }
  };

  const confirmMfaSetup = async () => {
    if (setupCode.length !== 6 || setupBusy) return;
    setSetupBusy(true);
    setMfaError(null);
    try {
      const response = await fetch('/api/auth/mfa/enable', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: setupCode }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        recoveryCodes?: string[];
        message?: string;
      };
      if (!response.ok || !data.recoveryCodes) {
        throw new Error(data.message ?? 'Could not enable two-factor authentication');
      }
      setRecoveryCodes(data.recoveryCodes);
      setSetup(null);
      setSetupCode('');
      await loadMfa();
    } catch (caught) {
      setMfaError(
        caught instanceof Error ? caught.message : 'Could not enable two-factor authentication',
      );
    } finally {
      setSetupBusy(false);
    }
  };

  const disableMfa = async () => {
    if (disableCode.trim().length < 6 || disableBusy) return;
    setDisableBusy(true);
    setMfaError(null);
    try {
      const response = await fetch('/api/auth/mfa/disable', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: disableCode.trim() }),
      });
      const data = (await response.json().catch(() => ({}))) as { message?: string };
      if (!response.ok) throw new Error(data.message ?? 'Could not disable two-factor');
      setDisableOpen(false);
      setDisableCode('');
      setRecoveryCodes(null);
      await loadMfa();
    } catch (caught) {
      setMfaError(caught instanceof Error ? caught.message : 'Could not disable two-factor');
    } finally {
      setDisableBusy(false);
    }
  };

  const copy = async (value: string, kind: 'secret' | 'codes') => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(kind);
      window.setTimeout(() => setCopied(null), 1_500);
    } catch {
      setMfaError('Clipboard is unavailable. Copy the value manually.');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl p-0">
        <DialogHeader className="border-b border-border p-5">
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-muted" />
            Security
          </DialogTitle>
          <DialogDescription>
            {mfa?.enabled
              ? 'Two-factor authentication is on. Review devices signed in to this account.'
              : 'Protect your account with an authenticator app, and review signed-in devices.'}
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[62vh] overflow-y-auto">
          <section className="border-b border-border p-5">
            <div className="flex flex-wrap items-center gap-2">
              <KeyRound className="h-4 w-4 text-muted" />
              <h2 className="text-sm font-medium text-fg">Two-factor authentication</h2>
              {mfaLoading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-dim" />
              ) : mfa?.enabled ? (
                <Badge variant="accent">Enabled</Badge>
              ) : (
                <Badge variant="muted">Off</Badge>
              )}
            </div>

            <p className="mt-2 text-xs leading-relaxed text-dim">
              A time-based code from an authenticator app is required after the email code. Recovery
              codes are shown once and each can be used a single time.
            </p>

            {mfaError ? <p className="mt-2 text-xs text-danger">{mfaError}</p> : null}

            {recoveryCodes ? (
              <div className="mt-3 border border-amber/30 bg-amber/[0.05] p-3">
                <p className="text-xs font-medium text-amber">
                  Save these recovery codes now — they will not be shown again.
                </p>
                <pre className="mt-2 select-all whitespace-pre-wrap break-all font-mono text-[11px] leading-5 text-fg">
                  {recoveryCodes.join('\n')}
                </pre>
                <div className="mt-2 flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="subtle"
                    onClick={() => void copy(recoveryCodes.join('\n'), 'codes')}
                  >
                    {copied === 'codes' ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                    {copied === 'codes' ? 'Copied' : 'Copy codes'}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setRecoveryCodes(null)}>
                    I saved them
                  </Button>
                </div>
              </div>
            ) : setup ? (
              <div className="mt-3 space-y-3 border border-border bg-bg/40 p-3">
                <div>
                  <p className="text-xs text-muted">
                    1. Add this secret to your authenticator app (or open the setup link).
                  </p>
                  <div className="mt-1.5 flex items-center gap-2">
                    <code className="min-w-0 flex-1 select-all break-all rounded-md border border-border bg-panel px-2 py-1.5 font-mono text-[11px] text-fg">
                      {setup.secret}
                    </code>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      aria-label="Copy MFA secret"
                      onClick={() => void copy(setup.secret, 'secret')}
                    >
                      {copied === 'secret' ? (
                        <Check className="h-3.5 w-3.5 text-success" />
                      ) : (
                        <Copy className="h-3.5 w-3.5" />
                      )}
                    </Button>
                  </div>
                  <a
                    href={setup.otpauthUrl}
                    className="mt-1 inline-block text-[11px] font-medium text-accent hover:underline"
                  >
                    Open in authenticator app
                  </a>
                </div>

                <div>
                  <label htmlFor="mfa-setup-code" className="text-xs text-muted">
                    2. Enter the current six-digit code.
                  </label>
                  <div className="mt-1.5 flex items-center gap-2">
                    <Input
                      id="mfa-setup-code"
                      value={setupCode}
                      onChange={(event) => setSetupCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      placeholder="000000"
                      className="h-9 w-32 font-mono tracking-[0.2em]"
                    />
                    <Button
                      size="sm"
                      onClick={() => void confirmMfaSetup()}
                      disabled={setupCode.length !== 6 || setupBusy}
                    >
                      {setupBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                      Enable
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setSetup(null);
                        setSetupCode('');
                      }}
                      disabled={setupBusy}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              </div>
            ) : mfa?.enabled ? (
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs text-dim">
                  {mfa.recoveryCodesRemaining} recovery code
                  {mfa.recoveryCodesRemaining === 1 ? '' : 's'} remaining
                  {mfa.enabledAt ? ` · enabled ${formatDate(mfa.enabledAt)}` : ''}
                </span>
                {disableOpen ? (
                  <div className="flex items-center gap-2">
                    <Input
                      value={disableCode}
                      onChange={(event) => setDisableCode(event.target.value)}
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      placeholder="Code or recovery"
                      className="h-8 w-40 font-mono text-xs"
                    />
                    <Button
                      size="sm"
                      variant="danger"
                      onClick={() => void disableMfa()}
                      disabled={disableCode.trim().length < 6 || disableBusy}
                    >
                      {disableBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                      Confirm
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setDisableOpen(false);
                        setDisableCode('');
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                ) : (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setDisableOpen(true)}
                    disabled={mfaLoading}
                  >
                    Disable
                  </Button>
                )}
              </div>
            ) : (
              <Button
                size="sm"
                variant="subtle"
                className="mt-3"
                onClick={() => void startMfaSetup()}
                disabled={mfaLoading}
              >
                {mfaLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <ShieldCheck className="h-3 w-3" />}
                Enable two-factor
              </Button>
            )}
          </section>

          <section>
            <div className="flex items-center gap-2 px-5 pt-4">
              <MonitorSmartphone className="h-4 w-4 text-muted" />
              <h2 className="text-sm font-medium text-fg">Active sessions</h2>
            </div>

            {loading ? (
              <div className="flex items-center gap-2 p-5 text-sm text-muted">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading sessions…
              </div>
            ) : sessions.length === 0 ? (
              <div className="p-5 text-sm text-dim">No active sessions.</div>
            ) : (
              <ul className="mt-2 divide-y divide-border">
                {sessions.map((session) => (
                  <li key={session.id} className="flex items-start gap-3 px-5 py-3">
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
          </section>
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
