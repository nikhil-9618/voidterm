import type { ReactNode } from 'react';
import Link from 'next/link';
import { ArrowLeft, Check, ShieldCheck, Sparkles, Zap } from 'lucide-react';
import { BrandLogo } from '@/components/brand-logo';
import { ThemeToggle } from '@/components/theme-toggle';

const POINTS = [
  { icon: Sparkles, text: 'Free OpenRouter models included' },
  { icon: Zap, text: 'Automatic fallback across six providers' },
  { icon: ShieldCheck, text: 'Private conversations, email OTP only' },
];

export function AuthShell({
  children,
  backHref,
  backLabel,
}: {
  children: ReactNode;
  backHref: string;
  backLabel: string;
}) {
  return (
    <div className="auth-aurora relative min-h-[100dvh] overflow-hidden bg-bg">
      <div className="relative grid min-h-[100dvh] lg:grid-cols-[1.04fr_0.96fr]">
        <aside className="relative hidden flex-col justify-between overflow-hidden border-r border-border/70 bg-panel/35 p-10 backdrop-blur-sm lg:flex xl:p-14">
          <Link href="/" aria-label="VOIDTERM home" className="flex w-fit items-center">
            <BrandLogo idPrefix="auth-aside" className="h-8 w-auto" />
          </Link>

          <div className="max-w-md py-10">
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-accent">
              One clear space
            </p>
            <h2 className="mt-4 text-balance text-4xl font-semibold leading-[1.08] tracking-[-0.045em] xl:text-[2.8rem]">
              Think in one place. Move between models.
            </h2>
            <p className="mt-5 text-[15px] leading-7 text-muted">
              No tabs, no scattered history, no setup ritual. Just the model you need and the
              conversation you were already having.
            </p>

            <ul className="mt-8 space-y-3.5">
              {POINTS.map((point) => (
                <li key={point.text} className="flex items-center gap-3 text-sm text-muted">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-border bg-elevated text-accent">
                    <point.icon className="h-3.5 w-3.5" />
                  </span>
                  {point.text}
                </li>
              ))}
            </ul>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-[11px] text-dim">
            {['OpenRouter', 'Gemini', 'Groq', 'DeepSeek', 'OpenAI', 'Ollama'].map((name) => (
              <span
                key={name}
                className="flex items-center gap-1.5 rounded-full border border-border bg-bg/40 px-2.5 py-1"
              >
                <Check className="h-2.5 w-2.5 text-success" />
                {name}
              </span>
            ))}
          </div>
        </aside>

        <div className="relative flex min-h-[100dvh] flex-col">
          <header className="flex h-16 shrink-0 items-center justify-between px-5">
            <Link href="/" aria-label="VOIDTERM home" className="flex items-center lg:hidden">
              <BrandLogo idPrefix="auth-mobile" className="h-7 w-auto" />
            </Link>
            <div className="ml-auto flex items-center gap-1">
              <ThemeToggle />
              <Link
                href={backHref}
                className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm text-muted transition-colors hover:bg-elevated hover:text-fg"
              >
                <ArrowLeft className="h-4 w-4" />
                {backLabel}
              </Link>
            </div>
          </header>

          <main className="flex flex-1 items-center justify-center px-5 py-10 sm:py-12">
            <div className="w-full max-w-sm">{children}</div>
          </main>

          <footer className="border-t border-border/70">
            <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5 text-xs text-dim">
              <span>© 2026 VOIDTERM</span>
              <span>Email OTP only</span>
            </div>
          </footer>
        </div>
      </div>
    </div>
  );
}
