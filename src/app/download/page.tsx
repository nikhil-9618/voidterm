import type { Metadata } from 'next';
import Link from 'next/link';
import {
  ArrowLeft,
  ArrowUpRight,
  Check,
  Download,
  Github,
  RefreshCw,
  ShieldCheck,
  Smartphone,
} from 'lucide-react';
import { BrandLogo } from '@/components/brand-logo';
import { getLatestAndroidRelease } from '@/lib/releases';

export const metadata: Metadata = {
  title: 'VOIDTERM for Android',
  description:
    'Download the VOIDTERM Android app. New builds are published on the website and on GitHub Releases, with an in-app update check.',
};

export const revalidate = 300;

function formatDate(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat('en', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

export default async function DownloadPage() {
  const release = await getLatestAndroidRelease();
  const published = formatDate(release.publishedAt);
  const size = release.size
    ? `${(release.size / (1024 * 1024)).toFixed(1)} MB`
    : 'Android APK';

  return (
    <div className="relative min-h-screen overflow-hidden bg-bg">
      <div
        className="hero-aurora pointer-events-none absolute inset-x-0 top-0 h-[620px]"
        aria-hidden="true"
      />
      <div
        className="hero-grid pointer-events-none absolute inset-x-0 top-0 h-[520px]"
        aria-hidden="true"
      />

      <header className="sticky top-0 z-30 border-b border-border/70 bg-bg/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-5xl items-center gap-3 px-5">
          <Link href="/" aria-label="VOIDTERM home" className="flex items-center">
            <BrandLogo idPrefix="download-header" className="h-7 w-auto" />
          </Link>
          <div className="ml-auto flex items-center gap-1.5">
            <Link
              href="/login"
              className="flex h-9 items-center rounded-lg px-3 text-sm font-medium text-muted transition-colors hover:bg-elevated hover:text-fg"
            >
              Open workspace
            </Link>
            <a
              href={release.releaseUrl}
              target="_blank"
              rel="noreferrer"
              className="flex h-9 items-center gap-2 rounded-lg border border-border bg-panel/70 px-3 text-sm font-medium text-muted transition-colors hover:border-border-strong hover:text-fg"
            >
              <Github className="h-4 w-4" />
              <span className="hidden sm:inline">Releases</span>
            </a>
          </div>
        </div>
      </header>

      <main className="relative mx-auto max-w-5xl px-5 pb-20 pt-12 sm:pt-16">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-dim transition-colors hover:text-fg"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to VOIDTERM
        </Link>

        <div className="mt-8 grid items-center gap-12 lg:grid-cols-[1.05fr_0.95fr]">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-border bg-panel/80 px-3 py-1.5 text-xs font-medium text-muted shadow-sm backdrop-blur">
              <span className="h-1.5 w-1.5 rounded-full bg-success" />
              Version {release.version} · Android 7.0+
            </div>

            <h1 className="mt-6 text-balance text-[2.7rem] font-semibold leading-[1.03] tracking-[-0.055em] sm:text-5xl">
              VOIDTERM, <span className="text-gradient">in your pocket.</span>
            </h1>
            <p className="mt-5 max-w-xl text-[16px] leading-7 text-muted">
              A focused mobile workspace with edge-swipe recents, native back handling, and the
              same private conversations as the web app.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <a
                href={release.downloadUrl}
                className="group flex h-12 items-center gap-2.5 rounded-xl bg-accent px-5 text-sm font-medium text-white shadow-[0_14px_35px_-16px_rgb(var(--accent-rgb)/0.9)] transition-all hover:bg-accent-strong"
              >
                <Download className="h-4 w-4" />
                Download APK
                <span className="text-white/70">· {size}</span>
              </a>
              <a
                href={release.releaseUrl}
                target="_blank"
                rel="noreferrer"
                className="flex h-12 items-center gap-2 rounded-xl border border-border bg-panel/60 px-5 text-sm font-medium text-muted backdrop-blur transition-colors hover:border-border-strong hover:text-fg"
              >
                View release
                <ArrowUpRight className="h-4 w-4" />
              </a>
            </div>

            <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-dim">
              <span className="flex items-center gap-1.5">
                <ShieldCheck className="h-3.5 w-3.5 text-success" />
                Private account sync
              </span>
              <span className="flex items-center gap-1.5">
                <RefreshCw className="h-3.5 w-3.5 text-accent" />
                In-app update check
              </span>
              {published ? (
                <span className="flex items-center gap-1.5">
                  <Check className="h-3.5 w-3.5 text-success" />
                  Updated {published}
                </span>
              ) : null}
            </div>

            {release.isFallback ? (
              <p className="mt-5 max-w-lg text-xs leading-relaxed text-dim">
                This build is hosted directly on the website. The newest APK will appear here and
                on GitHub Releases as soon as it is published.
              </p>
            ) : null}
          </div>

          <div className="relative mx-auto w-full max-w-[350px]">
            <div
              className="absolute -inset-8 rounded-full bg-accent/10 blur-3xl"
              aria-hidden="true"
            />
            <div className="relative rounded-[2.4rem] border border-border/80 bg-panel/80 p-2 shadow-[0_45px_120px_-50px_rgba(0,0,0,0.9)] backdrop-blur-xl">
              <div className="overflow-hidden rounded-[1.9rem] border border-border/70 bg-bg">
                <div className="flex items-center justify-between border-b border-border px-4 py-3">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-elevated">
                    <BrandLogo variant="mark" idPrefix="download-phone" className="h-5 w-5" />
                  </span>
                  <span className="text-[11px] font-medium text-muted">Recents</span>
                  <span className="h-8 w-8 rounded-lg border border-border bg-elevated" />
                </div>

                <div className="space-y-2 px-3 py-4">
                  <div className="rounded-xl border border-accent/20 bg-accent/[0.08] px-3 py-2.5">
                    <p className="text-[12px] font-medium text-fg">New chat</p>
                    <p className="mt-0.5 text-[10px] text-dim">Swipe right for recents</p>
                  </div>
                  {[
                    ['Review this API design', 'Today'],
                    ['Fix the failing migration', 'Today'],
                    ['Explain this stack trace', 'Yesterday'],
                    ['Draft a release checklist', 'Previous 7 days'],
                  ].map(([title, time]) => (
                    <div
                      key={title}
                      className="rounded-xl border border-transparent px-3 py-2.5"
                    >
                      <p className="truncate text-[12px] text-muted">{title}</p>
                      <p className="mt-0.5 text-[10px] text-dim">{time}</p>
                    </div>
                  ))}
                </div>

                <div className="border-t border-border p-3">
                  <div className="flex items-center gap-2 rounded-2xl border border-border bg-panel px-3 py-2.5">
                    <span className="flex-1 text-xs text-dim">Message VOIDTERM…</span>
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-accent text-white">
                      <ArrowUpRight className="h-3.5 w-3.5" />
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <section className="mt-20 grid gap-4 md:grid-cols-3">
          {[
            {
              icon: Smartphone,
              title: 'Built for touch',
              body: 'Edge-swipe recents, safe-area spacing, and a drawer that behaves like a native chat app.',
            },
            {
              icon: RefreshCw,
              title: 'Updates that find you',
              body: 'The app checks GitHub Releases on launch and offers the newest APK when one exists.',
            },
            {
              icon: ShieldCheck,
              title: 'Same private account',
              body: 'The Android app uses your email OTP session. Conversations stay tied to your account.',
            },
          ].map((item) => (
            <article key={item.title} className="rounded-2xl border border-border bg-panel p-5">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-accent/15 bg-accent/10 text-accent">
                <item.icon className="h-[18px] w-[18px]" />
              </span>
              <h2 className="mt-4 text-[15px] font-semibold">{item.title}</h2>
              <p className="mt-1.5 text-sm leading-6 text-muted">{item.body}</p>
            </article>
          ))}
        </section>

        <section className="mt-8 rounded-2xl border border-border bg-panel/50 p-6">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
            <div>
              <h2 className="text-sm font-semibold">Install on Android</h2>
              <ol className="mt-2 space-y-1 text-sm leading-6 text-muted">
                <li>1. Download the APK.</li>
                <li>2. Open it and allow installs from your browser or file manager.</li>
                <li>3. Sign in with the same email you use on the web.</li>
              </ol>
            </div>
            <a
              href={release.releaseUrl}
              target="_blank"
              rel="noreferrer"
              className="flex h-10 shrink-0 items-center justify-center gap-2 rounded-xl border border-border px-4 text-sm font-medium text-muted transition-colors hover:border-border-strong hover:text-fg"
            >
              <Github className="h-4 w-4" />
              Release history
            </a>
          </div>
        </section>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-5xl flex-col gap-2 px-5 py-6 text-xs text-dim sm:flex-row sm:items-center sm:justify-between">
          <span>© 2026 VOIDTERM</span>
          <span>
            Build {release.tag} ·{' '}
            <a href={release.releaseUrl} className="text-muted hover:text-fg" target="_blank" rel="noreferrer">
              GitHub Releases
            </a>
          </span>
        </div>
      </footer>
    </div>
  );
}
