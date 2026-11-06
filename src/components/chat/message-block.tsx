'use client';

import { useMemo, useState } from 'react';
import { Check, Copy, FileDown, Pencil, RefreshCw, Zap } from 'lucide-react';
import type { ChatMessageView } from './types';
import { ArtifactList } from './artifact-list';
import { MarkdownRenderer } from './markdown-renderer';
import { BrandLogo } from '@/components/brand-logo';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { extractArtifacts } from '@/lib/artifacts';
import { downloadAnswerMarkdown } from '@/lib/download';
import { cn, shortModelName } from '@/lib/utils';

export function MessageBlock({
  message,
  streaming = false,
  onRegenerate,
  onEdit,
}: {
  message: ChatMessageView;
  streaming?: boolean;
  onRegenerate?: (messageId: string) => void;
  onEdit?: (message: ChatMessageView) => void;
}) {
  const [copied, setCopied] = useState(false);
  const artifacts = useMemo(
    () =>
      message.role === 'assistant' && !streaming
        ? extractArtifacts(message.content, message.id)
        : [],
    [message.role, message.content, message.id, streaming],
  );

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1_400);
    } catch {
      // Clipboard can be unavailable in insecure contexts; the action is a no-op.
    }
  };

  if (message.role === 'user') {
    return (
      <article className="group mb-7 flex justify-end" aria-label="Your message">
        <div className="max-w-[85%]">
          {message.attachments.length > 0 ? (
            <div className="mb-2 flex flex-wrap justify-end gap-1.5">
              {message.attachments.map((attachment) => (
                <a
                  key={attachment.id}
                  href={attachment.fileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex max-w-full items-center gap-1.5 rounded-lg border border-border bg-panel px-2 py-1 text-[11px] text-muted transition-colors hover:text-fg"
                >
                  <span className="truncate">{attachment.fileUrl.split('/').pop()}</span>
                  <span className="shrink-0 text-dim">
                    {(attachment.fileSize / 1024).toFixed(0)} KB
                  </span>
                </a>
              ))}
            </div>
          ) : null}

          <div className="rounded-2xl rounded-br-md border border-accent/15 bg-accent/[0.075] px-4 py-3 text-[15px] leading-relaxed text-fg">
            <MarkdownRenderer content={message.content} />
          </div>

          <div className="mt-1 flex items-center justify-end gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100 max-sm:opacity-100">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon-sm" onClick={() => void handleCopy()} aria-label="Copy message">
                  {copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
                </Button>
              </TooltipTrigger>
              <TooltipContent>Copy</TooltipContent>
            </Tooltip>

            {onEdit ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon-sm" onClick={() => onEdit(message)} aria-label="Edit message">
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Edit in composer</TooltipContent>
              </Tooltip>
            ) : null}
          </div>
        </div>
      </article>
    );
  }

  return (
    <article className={cn('group mb-8', message.error && 'rounded-xl bg-danger/[0.04] p-4')}>
      <header className="mb-2 flex items-center gap-2">
        <BrandLogo
          variant="mark"
          idPrefix={`assistant-${message.id}`}
          className="h-6 w-6"
        />
        <span className="text-xs font-medium text-muted">
          {message.model ? shortModelName(message.model) : 'VOIDTERM'}
        </span>
        {streaming ? (
          <span className="flex items-center gap-1.5 text-[11px] text-dim">
            <span className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-accent" />
            Writing
          </span>
        ) : null}

        {!streaming && message.latencyMs !== undefined ? (
          <span
            className="flex items-center gap-1 text-[10px] text-dim"
            title="Time to first token"
          >
            <Zap className="h-3 w-3 text-success" />
            {(message.latencyMs / 1000).toFixed(1)}s
          </span>
        ) : null}

        <div className="ml-auto flex items-center gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100 max-sm:opacity-100">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon-sm" onClick={() => void handleCopy()} aria-label="Copy message">
                {copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent>Copy</TooltipContent>
          </Tooltip>

          {message.content ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => downloadAnswerMarkdown(message.content, message.id)}
                  aria-label="Download response as Markdown"
                >
                  <FileDown className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Download .md</TooltipContent>
            </Tooltip>
          ) : null}

          {onRegenerate && !streaming && !message.pending ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => onRegenerate(message.id)}
                  aria-label="Regenerate response"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Regenerate</TooltipContent>
            </Tooltip>
          ) : null}
        </div>
      </header>

      {message.content ? (
        message.role === 'system' && message.transient ? (
          <div className="rounded-xl border border-danger/20 bg-danger/[0.04] px-4 py-3 text-sm leading-relaxed text-fg">
            <span className="mb-1 block text-xs font-medium text-danger">Request declined</span>
            {message.content}
          </div>
        ) : (
          <MarkdownRenderer content={message.content} streaming={streaming} />
        )
      ) : streaming ? (
        <div className="flex items-center gap-2 py-1 text-sm text-dim">
          <span className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-accent" />
          Thinking…
        </div>
      ) : (
        <p className="text-sm text-dim">No response.</p>
      )}

      {!streaming && artifacts.length > 0 ? (
        <ArtifactList artifacts={artifacts} className="mt-4" />
      ) : null}

      {message.error ? (
        <p className="mt-2 text-xs leading-relaxed text-danger">{message.error}</p>
      ) : null}
    </article>
  );
}
