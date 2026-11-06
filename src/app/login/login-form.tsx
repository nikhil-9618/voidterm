'use client';

import { useState } from 'react';
import type * as React from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, Loader2, Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [devMode, setDevMode] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (sending || sent) return;

    setSending(true);
    setError(null);

    try {
      const response = await fetch('/api/auth/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });

      const data = (await response.json().catch(() => ({}))) as {
        message?: string;
        dev?: boolean;
        error?: string;
      };

      if (!response.ok) {
        setError(data.message ?? 'Could not send a code. Try again.');
        setSending(false);
        return;
      }

      setSent(true);
      setDevMode(Boolean(data.dev));
      window.setTimeout(() => {
        router.push(`/verify?email=${encodeURIComponent(email.trim().toLowerCase())}`);
      }, 600);
    } catch {
      setError('Network error. Check your connection and retry.');
      setSending(false);
    }
  };

  return (
    <div>
      <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-border bg-elevated text-muted">
        <Mail className="h-5 w-5" />
      </span>
      <h1 className="mt-6 text-3xl font-semibold tracking-[-0.035em]">Sign in</h1>
      <p className="mt-2 text-sm leading-relaxed text-muted">
        Enter your email and we’ll send a six-digit code. No password needed.
      </p>

      <form onSubmit={(event) => void submit(event)} className="mt-8">
        <label htmlFor="email" className="block text-[13px] font-medium text-fg">
          Email address
        </label>
        <Input
          id="email"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          autoFocus
          required
          maxLength={254}
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="you@example.com"
          disabled={sending || sent}
          className="mt-2 h-11"
        />

        {error ? (
          <p className="mt-3 rounded-lg bg-danger/10 px-3 py-2 text-xs leading-relaxed text-danger">
            {error}
          </p>
        ) : null}

        {sent ? (
          <div className="mt-3 rounded-lg bg-success/10 px-3 py-2 text-xs leading-relaxed text-success">
            <p className="font-medium">Check your inbox.</p>
            <p className="mt-1 text-muted">
              If that email is registered, a code was sent. Redirecting…
            </p>
            {devMode ? (
              <p className="mt-1 text-amber">
                Development mode: the code was printed to the server console.
              </p>
            ) : null}
          </div>
        ) : null}

        <Button
          type="submit"
          disabled={sending || sent || email.trim().length < 3}
          className="mt-4 h-11 w-full"
        >
          {sending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Sending code
            </>
          ) : sent ? (
            'Code sent'
          ) : (
            <>
              Continue
              <ArrowRight className="h-4 w-4" />
            </>
          )}
        </Button>
      </form>

      <p className="mt-6 text-xs leading-relaxed text-dim">
        Codes are single-use and expire after ten minutes. We never reveal whether an account
        exists.
      </p>
    </div>
  );
}
