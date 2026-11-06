'use client';

import { useEffect, useState } from 'react';
import type * as React from 'react';
import {
  Coins,
  Cpu,
  Gauge,
  KeyRound,
  ScanLine,
  Terminal,
  X,
} from 'lucide-react';
import { useChatWorkspace } from '@/components/chat/workspace-provider';
import { ProviderDot } from '@/components/provider-dot';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Kbd } from '@/components/ui/kbd';
import { PROVIDER_META, estimateCost } from '@/lib/ai/models';
import { scanlinesEnabled, toggleScanlines } from '@/lib/theme';
import { cn } from '@/lib/utils';

const FALLBACK_CHAIN = ['groq', 'gemini', 'deepseek', 'openai'] as const;

function StatBar({ value, tone }: { value: number; tone: 'accent' | 'amber' }) {
  return (
    <span className="inline-flex items-center gap-[2px]" aria-hidden="true">
      {Array.from({ length: 5 }, (_, index) => (
        <span
          key={index}
          className={cn(
            'block h-[3px] w-[6px]',
            index < value
              ? tone === 'accent'
                ? 'bg-accent'
                : 'bg-amber'
              : 'bg-border-strong',
          )}
        />
      ))}
    </span>
  );
}

function Section({
  label,
  icon: Icon,
  children,
}: {
  label: string;
  icon: typeof Cpu;
  children: React.ReactNode;
}) {
  return (
    <section className="border-b border-border px-3 py-3">
      <h2 className="mb-2 flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.16em] text-dim">
        <Icon className="h-3 w-3" />
        {label}
      </h2>
      {children}
    </section>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-2 py-0.5 font-mono text-[10px]">
      <span className="shrink-0 uppercase tracking-wide text-dim">{label}</span>
      <span className="min-w-0 truncate text-right text-muted">{value}</span>
    </div>
  );
}

export function ContextPanel({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { user, modelSpec, model, usage, providerUsed, conversation, messageCount, systemPrompt, setSystemPrompt } =
    useChatWorkspace();
  const [scanlines, setScanlines] = useState(true);

  useEffect(() => {
    setScanlines(scanlinesEnabled());
  }, []);

  if (!open) return null;

  const outputTokens = usage?.completionTokens ?? 0;
  const cost = estimateCost(model, outputTokens);

  return (
    <aside className="hidden h-full w-[320px] shrink-0 flex-col border-l border-border bg-panel xl:flex">
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-border px-3">
        <span className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-muted">
          <Terminal className="h-3 w-3 text-accent" />
          context
        </span>
        <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close context panel">
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <Section label="active model" icon={Cpu}>
          <div className="border border-border bg-bg/60 p-2.5">
            <div className="flex items-center gap-1.5">
              <ProviderDot provider={modelSpec.provider} />
              <span className="font-mono text-[9px] uppercase tracking-[0.1em] text-dim">
                {PROVIDER_META[modelSpec.provider].name}
              </span>
              <Badge variant="muted" className="ml-auto">
                {modelSpec.contextK >= 1000 ? `${(modelSpec.contextK / 1000).toFixed(1)}m ctx` : `${modelSpec.contextK}k ctx`}
              </Badge>
            </div>
            <p className="mt-1.5 font-mono text-[12px] text-fg">{modelSpec.label}</p>
            <p className="mt-1 font-mono text-[10px] leading-relaxed text-dim">
              {modelSpec.blurb}
            </p>

            <div className="mt-2.5 space-y-1.5 border-t border-border pt-2">
              <div className="flex items-center justify-between font-mono text-[9px] uppercase tracking-wide text-dim">
                <span className="flex items-center gap-1.5">
                  <Gauge className="h-3 w-3" /> speed
                </span>
                <StatBar value={modelSpec.speed} tone="accent" />
              </div>
              <div className="flex items-center justify-between font-mono text-[9px] uppercase tracking-wide text-dim">
                <span className="flex items-center gap-1.5">
                  <Gauge className="h-3 w-3" /> quality
                </span>
                <StatBar value={modelSpec.quality} tone="amber" />
              </div>
              <div className="flex items-center justify-between font-mono text-[9px] uppercase tracking-wide text-dim">
                <span className="flex items-center gap-1.5">
                  <Coins className="h-3 w-3" /> output
                </span>
                <span className="text-muted">
                  {modelSpec.costPer1kOut === 0
                    ? 'local · free'
                    : `$${modelSpec.costPer1kOut.toFixed(4)} / 1k`}
                </span>
              </div>
            </div>
          </div>
        </Section>

        <Section label="session" icon={KeyRound}>
          <Row
            label="tier"
            value={
              <Badge variant={user.tier >= 2 ? 'accent' : 'muted'}>
                tier {user.tier} · research
              </Badge>
            }
          />
          <Row label="auth" value="email_otp" />
          <Row label="account" value={user.email} />
          <Row label="conversation" value={conversation ? conversation.title : 'unsaved'} />
          <Row label="turns" value={`${messageCount} messages`} />
          {conversation ? (
            <Row label="id" value={<span className="font-mono">{conversation.id.slice(0, 12)}…</span>} />
          ) : null}
        </Section>

        <Section label="token usage · last turn" icon={Coins}>
          {usage ? (
            <>
              <Row label="prompt" value={usage.promptTokens ?? '—'} />
              <Row label="completion" value={usage.completionTokens ?? '—'} />
              <Row label="total" value={usage.totalTokens ?? '—'} />
              <Row
                label="est. cost"
                value={cost > 0 ? `$${cost.toFixed(5)}` : '$0.00000'}
              />
              <Row label="served by" value={providerUsed ?? 'unknown'} />
            </>
          ) : (
            <div className="border border-dashed border-border px-2 py-2 font-mono text-[10px] leading-relaxed text-dim">
              awaiting a completed turn.
              <br />
              usage is reported by the provider when available.
            </div>
          )}
        </Section>

        <Section label="system prompt override" icon={Terminal}>
          <Textarea
            value={systemPrompt}
            onChange={(event) => setSystemPrompt(event.target.value)}
            placeholder="default tier-2 research prompt (built in). Leave empty to use it."
            rows={5}
            maxLength={8_000}
            className="min-h-[104px] bg-bg/60 text-[11px] leading-relaxed"
          />
          <div className="mt-1.5 flex items-center justify-between">
            <span className="font-mono text-[9px] uppercase tracking-wide text-dim">
              {systemPrompt.length}/8000
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSystemPrompt('')}
              disabled={systemPrompt.length === 0}
            >
              reset
            </Button>
          </div>
          <p className="mt-1 font-mono text-[9px] leading-relaxed text-dim">
            Applied to the next request and stored on the conversation. Policy modifiers are
            appended server-side.
          </p>
        </Section>

        <Section label="fallback chain" icon={Gauge}>
          <ol className="space-y-1">
            {[modelSpec.provider, ...FALLBACK_CHAIN].map((provider, index) => (
              <li key={`${provider}-${index}`} className="flex items-center gap-1.5 font-mono text-[10px]">
                <span className="w-3 text-right text-dim">{index + 1}</span>
                <ProviderDot provider={provider} />
                <span className={index === 0 ? 'text-fg' : 'text-muted'}>
                  {PROVIDER_META[provider].name}
                </span>
                {index === 0 ? (
                  <span className="ml-auto text-[8px] uppercase tracking-wide text-accent">primary</span>
                ) : null}
              </li>
            ))}
          </ol>
          <p className="mt-1.5 font-mono text-[9px] leading-relaxed text-dim">
            A provider is only skipped when it fails before emitting a token. Mid-stream failure
            surfaces an error rather than splicing two completions.
          </p>
        </Section>

        <Section label="keyboard" icon={Terminal}>
          <div className="space-y-1 font-mono text-[9px] uppercase tracking-wide text-dim">
            {[
              ['command palette', '⌘K'],
              ['new chat', '⌘/'],
              ['toggle sidebar', '⌘B'],
              ['toggle context', '⌘⇧B'],
              ['send', '↵'],
              ['new line', '⇧↵'],
              ['stop stream', 'esc'],
            ].map(([label, key]) => (
              <div key={label} className="flex items-center justify-between">
                <span>{label}</span>
                <Kbd>{key}</Kbd>
              </div>
            ))}
          </div>
        </Section>

        <Section label="interface" icon={ScanLine}>
          <button
            type="button"
            onClick={() => setScanlines(toggleScanlines())}
            className="flex w-full items-center justify-between border border-border bg-bg/60 px-2 py-1.5 font-mono text-[10px] text-muted transition-colors hover:border-accent/40 hover:text-fg"
          >
            <span>scanline overlay</span>
            <span className={cn('uppercase tracking-wide', scanlines ? 'text-accent' : 'text-dim')}>
              {scanlines ? 'on' : 'off'}
            </span>
          </button>
        </Section>
      </div>

      <div className="shrink-0 border-t border-border px-3 py-2 font-mono text-[9px] uppercase tracking-[0.08em] text-dim">
        {model} · fallback armed · tier_2
      </div>
    </aside>
  );
}
