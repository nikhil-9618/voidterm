'use client';

import { useEffect, useRef, useState } from 'react';
import type * as React from 'react';
import { ChevronDown, Loader2, Paperclip, Send, Square, X, Zap } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';
import { Kbd } from '@/components/ui/kbd';
import { ProviderDot } from '@/components/provider-dot';
import { ModelMatrix } from './model-matrix';
import { useChatWorkspace } from './workspace-provider';
import type { LocalAttachment } from './types';
import { cn } from '@/lib/utils';

const MAX_CHARS = 32_000;

export function ChatInput({
  value,
  onChange,
  onSend,
  onStop,
  streaming,
  disabled = false,
  focusToken = 0,
}: {
  value: string;
  onChange: (value: string) => void;
  onSend: (attachments: LocalAttachment[]) => void;
  onStop: () => void;
  streaming: boolean;
  disabled?: boolean;
  focusToken?: number;
}) {
  const { model, modelSpec, setModel } = useChatWorkspace();
  const [matrixOpen, setMatrixOpen] = useState(false);
  const [attachments, setAttachments] = useState<LocalAttachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const element = textareaRef.current;
    if (!element) return;
    element.style.height = '0px';
    element.style.height = `${Math.min(Math.max(element.scrollHeight, 52), 200)}px`;
  }, [value]);

  useEffect(() => {
    if (focusToken > 0) textareaRef.current?.focus();
  }, [focusToken]);

  const tooLong = value.length > MAX_CHARS;
  const canSend =
    value.trim().length > 0 && !tooLong && !disabled && !uploading && !streaming;

  const submit = () => {
    if (!canSend) return;
    const outgoing = attachments;
    setAttachments([]);
    setUploadError(null);
    onSend(outgoing);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter') {
      // Do not send while an IME is composing (Japanese, Chinese, etc.).
      if (event.nativeEvent.isComposing) return;
      // Shift+Enter inserts a newline; plain Enter and Cmd/Ctrl+Enter send.
      if (event.shiftKey) return;
      event.preventDefault();
      submit();
      return;
    }
    if (event.key === 'Escape' && streaming) {
      event.preventDefault();
      onStop();
    }
  };

  const handleFiles = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';
    if (files.length === 0) return;

    setUploading(true);
    setUploadError(null);

    try {
      const uploaded: LocalAttachment[] = [];

      for (const file of files.slice(0, 4)) {
        if (file.size > 10 * 1024 * 1024) {
          setUploadError(`${file.name} is larger than 10 MB`);
          continue;
        }

        const formData = new FormData();
        formData.append('file', file);

        const response = await fetch('/api/attachments/upload', {
          method: 'POST',
          body: formData,
        });
        const data = (await response.json().catch(() => ({}))) as {
          attachment?: LocalAttachment;
          message?: string;
        };

        if (!response.ok || !data.attachment) {
          setUploadError(data.message ?? `Could not upload ${file.name}`);
          continue;
        }

        uploaded.push({
          ...data.attachment,
          fileName: data.attachment.fileName ?? file.name,
        });
      }

      if (uploaded.length > 0) {
        setAttachments((current) => [...current, ...uploaded].slice(0, 6));
      }
    } catch {
      setUploadError('Upload failed. Check the connection and try again.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="px-4 pb-4">
      <div className="mx-auto w-full max-w-3xl">
        <div className="composer-shadow rounded-2xl border border-border/80 bg-panel/90 p-2 transition-colors focus-within:border-accent/40">
          {attachments.length > 0 || uploadError ? (
            <div className="space-y-1.5 px-2 pb-2 pt-1">
              {attachments.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {attachments.map((attachment, index) => (
                    <span
                      key={`${attachment.fileUrl}-${index}`}
                      className="inline-flex max-w-full items-center gap-1.5 rounded-lg bg-elevated px-2 py-1 text-[11px] text-muted"
                    >
                      <Paperclip className="h-3 w-3 shrink-0" />
                      <span className="max-w-[180px] truncate">
                        {attachment.fileName ?? attachment.fileUrl.split('/').pop()}
                      </span>
                      <button
                        type="button"
                        aria-label="Remove attachment"
                        onClick={() =>
                          setAttachments((current) =>
                            current.filter((_, itemIndex) => itemIndex !== index),
                          )
                        }
                        className="text-dim transition-colors hover:text-danger"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
              ) : null}
              {uploadError ? <p className="text-xs text-danger">{uploadError}</p> : null}
            </div>
          ) : null}

          <textarea
            ref={textareaRef}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            onKeyDown={handleKeyDown}
            rows={1}
            spellCheck
            maxLength={MAX_CHARS}
            enterKeyHint="send"
            aria-label="Message input"
            placeholder="Message VOIDTERM…"
            disabled={disabled}
            className="min-h-[52px] w-full resize-none border-0 bg-transparent px-3 py-2.5 font-sans text-[15px] leading-6 text-fg placeholder:text-dim focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
          />

          <div className="flex items-center gap-1 px-1 pb-0.5 pt-1">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              accept="image/*,.pdf,.txt,.md,.json,.log,.csv,.yaml,.yml,.ts,.tsx,.js,.py,.sh,.sql"
              onChange={(event) => void handleFiles(event)}
            />
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading || streaming}
                  aria-label="Attach a file"
                >
                  {uploading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Paperclip className="h-4 w-4" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>Attach a file (10 MB max)</TooltipContent>
            </Tooltip>

            <Popover open={matrixOpen} onOpenChange={setMatrixOpen}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className={cn(
                    'inline-flex h-8 max-w-[190px] items-center gap-1.5 rounded-lg px-2 text-xs text-muted transition-colors hover:bg-elevated hover:text-fg',
                    matrixOpen && 'bg-elevated text-fg',
                  )}
                  aria-label="Select model"
                  aria-expanded={matrixOpen}
                  title={modelSpec.speed >= 5 ? 'Fast model' : undefined}
                >
                  <ProviderDot provider={modelSpec.provider} />
                  <span className="truncate">{modelSpec.label}</span>
                  {modelSpec.speed >= 5 ? (
                    <Zap className="h-3 w-3 shrink-0 text-success" aria-hidden="true" />
                  ) : null}
                  <ChevronDown className="h-3 w-3 shrink-0 text-dim" />
                </button>
              </PopoverTrigger>
              <PopoverContent align="start" side="top" className="w-auto p-0">
                <ModelMatrix value={model} onChange={setModel} onClose={() => setMatrixOpen(false)} />
              </PopoverContent>
            </Popover>

            <span className={cn('ml-auto text-[11px]', tooLong ? 'text-danger' : 'text-dim')}>
              {value.length > 20_000 ? `${value.length}/${MAX_CHARS}` : ''}
            </span>

            {streaming ? (
              <Button
                type="button"
                variant="subtle"
                size="icon-sm"
                onClick={onStop}
                className="rounded-full"
                aria-label="Stop generating"
              >
                <Square className="h-3 w-3 fill-current" />
              </Button>
            ) : (
              <Button
                type="button"
                size="icon-sm"
                onClick={submit}
                disabled={!canSend}
                className="rounded-full shadow-[0_8px_22px_-10px_rgb(var(--accent-rgb)/0.9)]"
                aria-label="Send message"
              >
                <Send className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </div>

        <div className="mt-2 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[10px] text-dim">
          <span className="inline-flex items-center gap-1">
            <Kbd>↵</Kbd> send
          </span>
          <span className="inline-flex items-center gap-1">
            <Kbd>⇧↵</Kbd> new line
          </span>
          <span className="hidden sm:inline">
            VOIDTERM can make mistakes. Check important information.
          </span>
        </div>
      </div>
    </div>
  );
}
