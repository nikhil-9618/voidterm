import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  Layers3,
  LockKeyhole,
  Sparkles,
  Zap,
} from 'lucide-react';
import { BrandLogo } from '@/components/brand-logo';
import { ThemeToggle } from '@/components/theme-toggle';
import { getSessionFromCookies } from '@/lib/auth';
import { PROVIDER_META } from '@/lib/ai/models';
import type { ProviderId } from '@/lib/ai/types';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'VOIDTERM — one calm workspace for every model',
  description:
    'A clean, multi-provider AI workspace with free OpenRouter models, provider fallback, and email OTP sign-in.',
};

const FEATURES = [
  {
    icon: Layers3,
    title: 'Every model, one place',
    body: 'Switch between OpenRouter, Gemini, Groq, DeepSeek, OpenAI, and Ollama without changing tabs.',
    detail: 'Six providers',
  },
  {
    icon: Sparkles,
    title: 'Free to start',
    body: 'OpenRouter free models are the default. No card is required to send your first message.',
    detail: 'No credit card',
  },
  {
    icon: LockKeyhole,
    title: 'Private by default',
    body: 'Email OTP only. Your conversations are tied to your account and never shown to anyone else.',
    detail: 'Yours alone',
  },
];

const STATS = [
  { value: '6', label: 'providers in one workspace' },
  { value: '0', label: 'credit cards required' },
  { value: '1', label: 'quiet place for every chat' },
];

const PROVIDERS: ProviderId[] = ['openrouter', 'gemini', 'groq', 'deepseek', 'openai', 'ollama'];

export default async function LandingPage() {
  const session = await getSessionFromCookies();
  if (session) redirect('/c');

  return (
    <div className="relative min-h-screen overflow-hidden bg-bg">
      <div
        className="hero-aurora pointer-events-none absolute inset-x-0 top-0 h-[780px]"
        aria-hidden="true"
      />
      <div
        className="hero-grid pointer-events-none absolute inset-x-0 top-0 h-[640px]"
        aria-hidden="true"
      />

      <header className="sticky top-0 z-30 border-b border-border/70 bg-bg/75 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-8 px-5">
          <Link href="/" aria-label="VOIDTERM home" className="flex items-center">
            <BrandLogo idPrefix="landing-header" className="h-7 w-auto sm:h-8" />
          </Link>

          <nav className="hidden items-center gap-1 md:flex" aria-label="Main navigation">
            <a
              href="#models"
              className="rounded-lg px-3 py-2 text-[13px] font-medium text-muted transition-colors hover:bg-elevated hover:text-fg"
            >
              Models
            </a>
            <a
              href="#features"
              className="rounded-lg px-3 py-2 text-[13px] font-medium text-muted transition-colors hover:bg-elevated hover:text-fg"
            >
              Features
            </a>
          </nav>

          <div className="ml-auto flex items-center gap-1.5">
            <ThemeToggle />
            <Link
              href="/login"
              className="hidden h-9 items-center rounded-lg px-3 text-sm font-medium text-muted transition-colors hover:bg-elevated hover:text-fg sm:flex"
            >
              Sign in
            </Link>
            <Link
              href="/login"
              className="flex h-9 items-center gap-2 rounded-lg bg-accent px-4 text-sm font-medium text-white shadow-[0_10px_30px_-14px_rgb(var(--accent-rgb)/0.8)] transition-all hover:bg-accent-strong"
            >
              Get started
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </header>

      <main className="relative">
        <section className="mx-auto grid max-w-7xl items-center gap-16 px-5 pb-20 pt-16 lg:grid-cols-[1.02fr_0.98fr] lg:pb-28 lg:pt-24">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-border bg-panel/80 px-3 py-1.5 text-xs font-medium text-muted shadow-sm backdrop-blur">
              <span className="h-1.5 w-1.5 rounded-full bg-success shadow-[0_0_0_3px_rgb(var(--success-rgb)/0.12)]" />
              Free OpenRouter models included
            </div>

            <h1 className="mt-6 max-w-[640px] text-balance text-[2.85rem] font-semibold leading-[1.02] tracking-[-0.055em] sm:text-[4.25rem]">
              One quiet place for <span className="text-gradient">every model.</span>
            </h1>
            <p className="mt-6 max-w-xl text-[16px] leading-7 text-muted sm:text-[17px]">
              VOIDTERM brings the best AI models into a focused workspace. Pick a model, ask
              anything, and keep the conversation organized.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link
                href="/login"
                className="group flex h-11 items-center gap-2 rounded-xl bg-accent px-5 text-sm font-medium text-white shadow-[0_14px_35px_-16px_rgb(var(--accent-rgb)/0.9)] transition-all hover:bg-accent-strong"
              >
                Start chatting
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </Link>
              <Link
                href="#features"
                className="flex h-11 items-center rounded-xl border border-border bg-panel/60 px-5 text-sm font-medium text-muted backdrop-blur transition-colors hover:border-border-strong hover:text-fg"
              >
                See what’s inside
              </Link>
            </div>

            <div className="mt-9 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-dim">
              <span className="flex items-center gap-1.5">
                <Check className="h-3.5 w-3.5 text-success" />
                No credit card
              </span>
              <span className="flex items-center gap-1.5">
                <Check className="h-3.5 w-3.5 text-success" />
                Email OTP
              </span>
              <span className="flex items-center gap-1.5">
                <Check className="h-3.5 w-3.5 text-success" />
                Your history stays yours
              </span>
            </div>
          </div>

          <div className="relative mx-auto w-full max-w-[560px]">
            <div
              className="absolute -inset-10 rounded-full bg-accent/10 blur-3xl"
              aria-hidden="true"
            />
            <div className="relative rounded-[1.9rem] border border-border/80 bg-panel/75 p-1.5 shadow-[0_45px_120px_-50px_rgba(0,0,0,0.9)] backdrop-blur-xl">
              <div className="overflow-hidden rounded-[1.45rem] border border-border/70 bg-bg">
                <div className="flex items-center justify-between border-b border-border px-4 py-3.5">
                  <div className="flex items-center gap-2.5">
                    <BrandLogo variant="mark" idPrefix="landing-mockup" className="h-6 w-6" />
                    <span className="text-sm font-medium">New conversation</span>
                  </div>
                  <span className="rounded-md border border-border bg-elevated px-2 py-1 text-[11px] text-muted">
                    OpenRouter Free
                  </span>
                </div>

                <div className="space-y-6 px-4 py-7 sm:px-6">
                  <div className="ml-auto max-w-[86%] rounded-2xl rounded-br-md border border-accent/15 bg-accent/[0.09] px-4 py-3 text-sm leading-relaxed">
                    How should I structure authentication for a small Next.js app?
                  </div>

                  <div className="max-w-[94%] text-sm leading-relaxed text-muted">
                    <p className="font-medium text-fg">Keep it simple.</p>
                    <p className="mt-2">
                      Use short-lived sessions, a database-backed revocation list, and email OTP
                      instead of passwords. Add rate limits before you add providers.
                    </p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <span className="rounded-md border border-border bg-elevated px-2 py-1 text-[11px] text-dim">
                        session cookies
                      </span>
                      <span className="rounded-md border border-border bg-elevated px-2 py-1 text-[11px] text-dim">
                        email OTP
                      </span>
                    </div>
                  </div>
                </div>

                <div className="border-t border-border p-3">
                  <div className="flex items-center gap-2 rounded-xl border border-border bg-panel px-3 py-2.5">
                    <span className="flex-1 text-sm text-dim">Ask anything…</span>
                    <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent text-white">
                      <ArrowRight className="h-3.5 w-3.5" />
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="absolute -right-2 top-24 hidden items-center gap-2 rounded-xl border border-border bg-panel/90 px-3 py-2 shadow-panel backdrop-blur sm:flex">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-success/10 text-success">
                <Zap className="h-3.5 w-3.5" />
              </span>
              <span>
                <span className="block text-[11px] font-medium text-fg">Automatic fallback</span>
                <span className="block text-[10px] text-dim">6 providers ready</span>
              </span>
            </div>
          </div>
        </section>

        <section id="models" className="border-y border-border bg-panel/35 backdrop-blur">
          <div className="mx-auto flex max-w-7xl flex-col items-center gap-4 px-5 py-6 sm:flex-row sm:justify-center sm:gap-8">
            <span className="text-xs font-medium uppercase tracking-[0.14em] text-dim">
              Works with
            </span>
            <div className="grid w-full grid-cols-2 gap-x-5 gap-y-2 sm:flex sm:w-auto sm:flex-wrap sm:items-center sm:gap-x-7">
              {PROVIDERS.map((provider) => (
                <span key={provider} className="flex items-center gap-2 text-sm text-muted">
                  <span
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ backgroundColor: PROVIDER_META[provider].color }}
                  />
                  {PROVIDER_META[provider].name}
                </span>
              ))}
            </div>
          </div>
        </section>

        <section id="features" className="mx-auto max-w-7xl px-5 py-20 sm:py-24">
          <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
            <div className="max-w-xl">
              <p className="text-sm font-medium text-accent">Less interface. More thinking.</p>
              <h2 className="mt-3 text-balance text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">
                Built to get out of your way.
              </h2>
            </div>
            <p className="max-w-sm text-sm leading-6 text-muted sm:text-right">
              The essentials are always one click away. Everything else stays out of the
              conversation.
            </p>
          </div>

          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {FEATURES.map((feature, index) => (
              <article
                key={feature.title}
                className="group relative overflow-hidden rounded-2xl border border-border bg-panel p-6 transition-all hover:-translate-y-0.5 hover:border-accent/30 hover:shadow-panel"
              >
                <div
                  className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-accent/70 to-transparent opacity-0 transition-opacity group-hover:opacity-100"
                  aria-hidden="true"
                />
                <div className="flex items-center justify-between">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-accent/15 bg-accent/10 text-accent">
                    <feature.icon className="h-[18px] w-[18px]" />
                  </span>
                  <span className="text-[11px] font-medium tracking-[0.12em] text-dim">
                    0{index + 1}
                  </span>
                </div>
                <h3 className="mt-6 text-[15px] font-semibold">{feature.title}</h3>
                <p className="mt-2 text-sm leading-6 text-muted">{feature.body}</p>
                <p className="mt-5 flex items-center gap-1.5 text-[11px] font-medium text-dim">
                  <Check className="h-3 w-3 text-success" />
                  {feature.detail}
                </p>
              </article>
            ))}
          </div>
        </section>

        <section className="border-y border-border bg-panel/30">
          <div className="mx-auto grid max-w-7xl grid-cols-3 divide-x divide-border/60 px-5">
            {STATS.map((stat) => (
              <div key={stat.label} className="px-2 py-9 text-center sm:py-12">
                <p className="text-3xl font-semibold tracking-[-0.05em] text-fg sm:text-4xl">
                  {stat.value}
                </p>
                <p className="mx-auto mt-2 max-w-[140px] text-[10px] leading-4 text-dim sm:text-xs">
                  {stat.label}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-5 py-20 sm:py-24">
          <div className="cta-surface relative overflow-hidden rounded-3xl border border-border p-7 sm:p-10 lg:p-12">
            <div
              className="pointer-events-none absolute -right-24 -top-28 h-80 w-80 rounded-full border border-accent/15"
              aria-hidden="true"
            />
            <div
              className="pointer-events-none absolute -bottom-32 right-16 h-64 w-64 rounded-full bg-accent/10 blur-3xl"
              aria-hidden="true"
            />
            <div className="relative flex flex-col gap-8 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex items-start gap-4">
                <BrandLogo variant="mark" idPrefix="landing-cta" className="h-12 w-12" />
                <div>
                  <h2 className="max-w-xl text-balance text-2xl font-semibold tracking-[-0.035em] sm:text-3xl">
                    Your next conversation is waiting.
                  </h2>
                  <p className="mt-2 max-w-lg text-sm leading-6 text-muted">
                    Sign in with your email. No password, no card, no setup ritual.
                  </p>
                </div>
              </div>
              <Link
                href="/login"
                className="group flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-fg px-5 text-sm font-medium text-bg transition-opacity hover:opacity-85"
              >
                Continue with email
                <ArrowUpRight className="h-4 w-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-5 py-6 text-xs text-dim sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <BrandLogo idPrefix="landing-footer" className="h-5 w-auto" />
            <span>© 2026 VOIDTERM</span>
          </div>
          <span>Six providers. One calm workspace.</span>
        </div>
      </footer>
    </div>
  );
}
