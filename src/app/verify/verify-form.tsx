'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { KeyRound, Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

const OTP_LENGTH = 6;

function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!local || !domain) return email;
  const visible = local.slice(0, 2);
  return `${visible}${'•'.repeat(Math.max(2, local.length - 2))}@${domain}`;
}

export function VerifyForm({ email }: { email: string }) {
  const router = useRouter();
  const [digits, setDigits] = useState<string[]>(Array(OTP_LENGTH).fill(''));
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(60);
  const [resending, setResending] = useState(false);
  const [resendNotice, setResendNotice] = useState<string | null>(null);

  const inputsRef = useRef<Array<HTMLInputElement | null>>([]);
  const submittedRef = useRef(false);

  useEffect(() => {
    inputsRef.current[0]?.focus();
    const timer = window.setInterval(() => {
      setCooldown((current) => (current > 0 ? current - 1 : 0));
    }, 1_000);
    return () => window.clearInterval(timer);
  }, []);

  const verify = useCallback(
    async (code: string) => {
      setVerifying(true);
      setError(null);

      try {
        const response = await fetch('/api/auth/verify-otp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, otp: code }),
        });

        const data = (await response.json().catch(() => ({}))) as { message?: string };

        if (!response.ok) {
          setError(data.message ?? 'Invalid or expired code.');
          setVerifying(false);
          submittedRef.current = false;
          setDigits(Array(OTP_LENGTH).fill(''));
          window.setTimeout(() => inputsRef.current[0]?.focus(), 20);
          return;
        }

        router.push('/c/new');
        router.refresh();
      } catch {
        setError('Network error while verifying. Try again.');
        setVerifying(false);
        submittedRef.current = false;
      }
    },
    [email, router],
  );

  const code = digits.join('');

  useEffect(() => {
    if (code.length === OTP_LENGTH && !submittedRef.current) {
      submittedRef.current = true;
      void verify(code);
    }
  }, [code, verify]);

  const focusIndex = (index: number) => {
    const target = inputsRef.current[Math.max(0, Math.min(OTP_LENGTH - 1, index))];
    target?.focus();
    target?.select();
  };

  const updateDigit = (index: number, value: string) => {
    const numeric = value.replace(/\D/g, '');
    if (!numeric) {
      setDigits((current) => current.map((digit, i) => (i === index ? '' : digit)));
      return;
    }

    if (numeric.length > 1) {
      const spread = numeric.slice(0, OTP_LENGTH).split('');
      setDigits((current) => {
        const next = [...current];
        spread.forEach((digit, offset) => {
          if (index + offset < OTP_LENGTH) next[index + offset] = digit;
        });
        return next;
      });
      focusIndex(index + spread.length);
      return;
    }

    setDigits((current) => current.map((digit, i) => (i === index ? numeric : digit)));
    focusIndex(index + 1);
  };

  const handleKeyDown = (index: number, event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Backspace') {
      if (!digits[index] && index > 0) {
        event.preventDefault();
        setDigits((current) => current.map((digit, i) => (i === index - 1 ? '' : digit)));
        focusIndex(index - 1);
      }
      return;
    }
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      focusIndex(index - 1);
      return;
    }
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      focusIndex(index + 1);
      return;
    }
    if (event.key === 'Enter' && code.length === OTP_LENGTH && !submittedRef.current) {
      event.preventDefault();
      submittedRef.current = true;
      void verify(code);
    }
  };

  const handlePaste = (index: number, event: React.ClipboardEvent<HTMLInputElement>) => {
    event.preventDefault();
    const pasted = event.clipboardData.getData('text').replace(/\D/g, '').slice(0, OTP_LENGTH);
    if (!pasted) return;

    setDigits((current) => {
      const next = [...current];
      pasted.split('').forEach((digit, offset) => {
        if (index + offset < OTP_LENGTH) next[index + offset] = digit;
      });
      return next;
    });
    focusIndex(index + pasted.length);
  };

  const resend = async () => {
    if (cooldown > 0 || resending) return;
    setResending(true);
    setError(null);
    setResendNotice(null);

    try {
      const response = await fetch('/api/auth/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = (await response.json().catch(() => ({}))) as { message?: string };

      if (!response.ok) {
        setError(data.message ?? 'Could not resend the code.');
        return;
      }

      setResendNotice(data.message ?? 'If that email is registered, a code was sent.');
      setCooldown(60);
      submittedRef.current = false;
      setDigits(Array(OTP_LENGTH).fill(''));
      focusIndex(0);
    } catch {
      setError('Network error while requesting a new code.');
    } finally {
      setResending(false);
    }
  };

  return (
    <div>
      <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-elevated text-muted">
            <KeyRound className="h-5 w-5" />
          </span>
          <h1 className="mt-6 text-3xl font-semibold tracking-[-0.03em]">Check your email</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            Enter the six-digit code sent to <span className="text-fg">{maskEmail(email)}</span>.
          </p>

          <div className="mt-8 flex gap-2" role="group" aria-label="One-time code">
            {digits.map((digit, index) => (
              <input
                key={index}
                ref={(node) => {
                  inputsRef.current[index] = node;
                }}
                value={digit}
                onChange={(event) => updateDigit(index, event.target.value)}
                onKeyDown={(event) => handleKeyDown(index, event)}
                onPaste={(event) => handlePaste(index, event)}
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={OTP_LENGTH}
                autoComplete={index === 0 ? 'one-time-code' : 'off'}
                aria-label={`Digit ${index + 1}`}
                disabled={verifying}
                className="h-14 w-full min-w-0 rounded-xl border border-border bg-panel text-center text-xl text-fg transition-colors focus:border-border-strong focus:outline-none focus:ring-2 focus:ring-accent/15 disabled:opacity-60"
              />
            ))}
          </div>

          {error ? (
            <p className="mt-3 rounded-lg bg-danger/10 px-3 py-2 text-xs leading-relaxed text-danger">
              {error}
            </p>
          ) : null}

          {resendNotice ? (
            <p className="mt-3 rounded-lg bg-success/10 px-3 py-2 text-xs leading-relaxed text-success">
              {resendNotice}
            </p>
          ) : null}

          <Button
            type="button"
            onClick={() => {
              if (code.length !== OTP_LENGTH || verifying) return;
              submittedRef.current = true;
              void verify(code);
            }}
            disabled={code.length !== OTP_LENGTH || verifying}
            className="mt-4 h-11 w-full"
          >
            {verifying ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Verifying
              </>
            ) : (
              'Continue'
            )}
          </Button>

          <div className="mt-4 flex items-center justify-between">
            <button
              type="button"
              onClick={() => void resend()}
              disabled={cooldown > 0 || resending}
              className="flex items-center gap-1.5 text-xs font-medium text-muted transition-colors hover:text-fg disabled:cursor-not-allowed disabled:text-dim"
            >
              {resending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
              {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend code'}
            </button>
            <Link href="/login" className="text-xs font-medium text-muted hover:text-fg">
              Use a different email
            </Link>
          </div>

      <p className="mt-6 text-xs leading-relaxed text-dim">
        Codes expire after ten minutes. Five incorrect attempts invalidate the code.
      </p>
    </div>
  );
}
