import Link from 'next/link';
import { BrandLogo } from '@/components/brand-logo';
import { ThemeToggle } from '@/components/theme-toggle';

export default function NotFound() {
  return (
    <div className="hero-aurora relative flex min-h-[100dvh] items-center justify-center overflow-hidden px-5">
      <div className="hero-grid pointer-events-none absolute inset-x-0 top-0 h-[520px]" aria-hidden="true" />
      <div className="absolute right-4 top-4 z-10">
        <ThemeToggle />
      </div>
      <div className="relative w-full max-w-sm text-center">
        <div className="relative mx-auto h-14 w-14">
          <div className="absolute inset-0 rounded-2xl bg-accent/20 blur-xl" aria-hidden="true" />
          <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl border border-border bg-panel shadow-panel">
            <BrandLogo variant="mark" idPrefix="not-found-mark" className="h-9 w-9" />
          </div>
        </div>
        <p className="mt-7 text-sm font-medium text-accent">404</p>
        <h1 className="mt-3 text-2xl font-semibold tracking-[-0.025em]">Page not found</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          This page does not exist, was deleted, or belongs to another account.
        </p>
        <div className="mt-6 flex justify-center gap-2">
          <Link
            href="/c/new"
            className="flex h-10 items-center rounded-lg bg-fg px-4 text-sm font-medium text-bg transition-opacity hover:opacity-85"
          >
            New chat
          </Link>
          <Link
            href="/"
            className="flex h-10 items-center rounded-lg border border-border px-4 text-sm font-medium text-muted transition-colors hover:text-fg"
          >
            Home
          </Link>
        </div>
      </div>
    </div>
  );
}
