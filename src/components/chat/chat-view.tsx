'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, ArrowUpRight, X } from 'lucide-react';
import { BrandLogo } from '@/components/brand-logo';
import type { MessageDTO } from '@/lib/dto';
import type { TokenUsage } from '@/lib/ai/types';
import { useConversations } from '@/hooks/use-conversations';
import { deriveConversationTitle } from '@/lib/dto';
import { modelLabel } from '@/lib/ai/models';
import { estimateTokens } from '@/lib/utils';
import { MessageList } from './message-list';
import { ChatInput } from './chat-input';
import { useChatWorkspace } from './workspace-provider';
import type { ChatMessageView, LocalAttachment } from './types';

type InitialConversation = {
  id: string;
  title: string;
  model: string;
  systemPrompt: string | null;
};

type ServerEvent =
  | { type: 'token'; token?: string }
  | {
      type: 'done';
      conversationId?: string;
      messageId?: string;
      providerUsed?: string;
      usage?: TokenUsage;
      model?: string;
      intent?: string;
    }
  | { type: 'error'; error?: string; conversationId?: string; messageId?: string };

type RunOptions = {
  message: string;
  attachments?: LocalAttachment[];
  regenerate?: boolean;
  addUser?: boolean;
};

const SUGGESTIONS = [
  {
    tag: 'sec',
    label: 'threat-model a JWT auth flow',
    prompt:
      'Threat-model a stateless JWT authentication flow for a Next.js app. Enumerate concrete attack paths (token theft, CSRF, fixation, revocation gaps) and give mitigations for each.',
  },
  {
    tag: 'research',
    label: 'explain a CVE patch diff',
    prompt:
      'Walk me through how to read a CVE patch diff to judge exploitability, using a recent memory-safety vulnerability as the example. Include the exact git commands and what to look for.',
  },
  {
    tag: 'code',
    label: 'build a Rust log parser',
    prompt:
      'Write a production-quality Rust CLI that streams JSON logs, counts per-status-code requests, and writes a summary without unbounded memory. Include tests.',
  },
  {
    tag: 'infra',
    label: 'audit nginx hardening',
    prompt:
      'Give me a hardened nginx reverse-proxy baseline for a Next.js origin: TLS settings, header handling, request limits, and the specific misconfigurations you see most often.',
  },
];

function localId(prefix: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function ChatView({
  initialConversation,
  initialMessages,
}: {
  initialConversation: InitialConversation | null;
  initialMessages: MessageDTO[];
}) {
  const router = useRouter();
  const workspace = useChatWorkspace();
  const { refresh: refreshConversations } = useConversations();

  const {
    model,
    systemPrompt,
    setModel,
    setSystemPrompt,
    setConversation: setWorkspaceConversation,
    setMessageCount,
    setUsage,
    setProviderUsed,
  } = workspace;

  const [messages, setMessages] = useState<ChatMessageView[]>(() =>
    initialMessages.map((message) => ({ ...message })),
  );
  const [draft, setDraft] = useState('');
  const [streamingId, setStreamingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [focusToken, setFocusToken] = useState(0);

  const conversationIdRef = useRef<string | null>(initialConversation?.id ?? null);
  const abortRef = useRef<AbortController | null>(null);
  const activeRequestRef = useRef(false);
  const pendingTextRef = useRef('');
  const flushTimerRef = useRef<number | null>(null);

  // Hydrate the shared workspace from the selected conversation.
  useEffect(() => {
    if (initialConversation) {
      setModel(initialConversation.model);
      setSystemPrompt(initialConversation.systemPrompt ?? '');
      setWorkspaceConversation({ ...initialConversation });
    } else {
      setSystemPrompt('');
      setWorkspaceConversation(null);
    }
    setUsage(null);
    setProviderUsed(null);
    setMessageCount(initialMessages.length);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialConversation?.id]);

  useEffect(() => {
    setMessageCount(messages.length);
  }, [messages.length, setMessageCount]);

  // Abort in-flight generation when navigating away, and drop any buffered
  // stream text that has not been painted yet.
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      if (flushTimerRef.current !== null) {
        window.clearTimeout(flushTimerRef.current);
      }
    };
  }, []);

  const runGeneration = useCallback(
    async ({ message, attachments = [], regenerate = false, addUser = true }: RunOptions) => {
      if (activeRequestRef.current) return;

      const targetConversationId = conversationIdRef.current;
      if (regenerate && !targetConversationId) {
        setNotice('There is no saved conversation to regenerate.');
        return;
      }

      activeRequestRef.current = true;
      setNotice(null);

      const startedAt = Date.now();
      let firstTokenAt: number | null = null;
      pendingTextRef.current = '';
      if (flushTimerRef.current !== null) {
        window.clearTimeout(flushTimerRef.current);
        flushTimerRef.current = null;
      }

      const assistantLocalId = localId('local-assistant');
      const userLocalId = addUser ? localId('local-user') : null;
      const now = new Date().toISOString();

      const assistantMessage: ChatMessageView = {
        id: assistantLocalId,
        role: 'assistant',
        content: '',
        tokens: null,
        model,
        intentClass: null,
        createdAt: now,
        attachments: [],
        pending: true,
      };

      if (addUser) {
        const userMessage: ChatMessageView = {
          id: userLocalId as string,
          role: 'user',
          content: message,
          tokens: estimateTokens(message),
          model,
          intentClass: null,
          createdAt: now,
          attachments: attachments.map((attachment, index) => ({
            id: `local-attachment-${index}`,
            fileUrl: attachment.fileUrl,
            fileType: attachment.fileType,
            fileSize: attachment.fileSize,
          })),
          pending: true,
        };
        setMessages((current) => [...current, userMessage, assistantMessage]);
      } else {
        setMessages((current) => [...current, assistantMessage]);
      }

      setStreamingId(assistantLocalId);

      const controller = new AbortController();
      abortRef.current = controller;

      const flushPendingText = () => {
        const pending = pendingTextRef.current;
        if (!pending) return;
        pendingTextRef.current = '';
        setMessages((current) =>
          current.map((item) =>
            item.id === assistantLocalId
              ? { ...item, content: item.content + pending }
              : item,
          ),
        );
      };

      const flushNow = () => {
        if (flushTimerRef.current !== null) {
          window.clearTimeout(flushTimerRef.current);
          flushTimerRef.current = null;
        }
        flushPendingText();
      };

      // A fast model can emit dozens of tiny chunks per second. Repainting the
      // whole markdown tree for each one makes the stream feel slower; batch
      // visual updates to roughly 20fps while preserving every token.
      const scheduleFlush = () => {
        if (flushTimerRef.current !== null) return;
        flushTimerRef.current = window.setTimeout(() => {
          flushTimerRef.current = null;
          flushPendingText();
        }, 50);
      };

      const rollback = () => {
        if (flushTimerRef.current !== null) {
          window.clearTimeout(flushTimerRef.current);
          flushTimerRef.current = null;
        }
        pendingTextRef.current = '';
        setMessages((current) =>
          current.filter(
            (item) =>
              item.id !== assistantLocalId && (!userLocalId || item.id !== userLocalId),
          ),
        );
        if (addUser) {
          setDraft((current) => (current.trim().length > 0 ? current : message));
        }
      };

      try {
        const response = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            conversationId: targetConversationId ?? undefined,
            message,
            model,
            systemPrompt,
            regenerate: regenerate || undefined,
            attachments: attachments.length > 0 ? attachments : undefined,
          }),
          signal: controller.signal,
        });

        if (!response.ok) {
          const data = (await response.json().catch(() => ({}))) as {
            error?: string;
            message?: string;
          };

          if (response.status === 401) {
            router.push('/login');
            router.refresh();
            return;
          }

          rollback();

          if (data.error === 'refused' || data.error === 'login_required') {
            setNotice(data.message ?? 'This request was declined by policy.');
          } else if (data.error === 'rate_limited') {
            setNotice(data.message ?? 'Rate limit reached. Try again shortly.');
          } else {
            setNotice(data.message ?? 'The request could not be completed.');
          }
          return;
        }

        if (userLocalId) {
          setMessages((current) =>
            current.map((item) =>
              item.id === userLocalId ? { ...item, pending: false } : item,
            ),
          );
        }

        const reader = response.body?.getReader();
        if (!reader) throw new Error('The response stream was empty.');

        const decoder = new TextDecoder();
        let buffer = '';
        let terminalEvent = false;
        let replaceAfter = false;
        let newConversationId: string | null = null;

        const handleEvent = (event: ServerEvent) => {
          if (event.type === 'token') {
            const token = event.token;
            if (!token) return;

            if (firstTokenAt === null) {
              firstTokenAt = Date.now();
              const latencyMs = Math.max(0, firstTokenAt - startedAt);
              setMessages((current) =>
                current.map((item) =>
                  item.id === assistantLocalId ? { ...item, latencyMs } : item,
                ),
              );
            }

            pendingTextRef.current += token;
            scheduleFlush();
            return;
          }

          if (event.type === 'done') {
            terminalEvent = true;
            flushNow();
            const doneMessageId = event.messageId ?? assistantLocalId;
            const doneConversationId = event.conversationId;
            const doneModel = event.model ?? model;

            setMessages((current) =>
              current.map((item) =>
                item.id === assistantLocalId
                  ? { ...item, id: doneMessageId, pending: false, model: doneModel }
                  : item,
              ),
            );

            if (doneConversationId) {
              conversationIdRef.current = doneConversationId;
              setWorkspaceConversation({
                id: doneConversationId,
                title: initialConversation?.title ?? deriveConversationTitle(message),
                model: doneModel,
                systemPrompt: systemPrompt || null,
              });
              if (!targetConversationId) {
                newConversationId = doneConversationId;
                replaceAfter = true;
              }
            }

            setUsage(event.usage ?? null);
            setProviderUsed(event.providerUsed ?? null);
            return;
          }

          if (event.type === 'error') {
            terminalEvent = true;
            flushNow();
            const failure = event.error ?? 'The provider stream failed.';
            const failedMessageId = event.messageId ?? assistantLocalId;
            setMessages((current) =>
              current.map((item) =>
                item.id === assistantLocalId
                  ? { ...item, id: failedMessageId, pending: false, error: failure }
                  : item,
              ),
            );
            setNotice(failure);
          }
        };

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          let boundary = buffer.indexOf('\n\n');
          while (boundary !== -1) {
            const rawEvent = buffer.slice(0, boundary);
            buffer = buffer.slice(boundary + 2);

            for (const line of rawEvent.split('\n')) {
              if (!line.startsWith('data:')) continue;
              const payload = line.slice(5).trim();
              if (!payload) continue;
              try {
                handleEvent(JSON.parse(payload) as ServerEvent);
              } catch {
                // Ignore malformed keep-alives; a broken event must not kill the UI.
              }
            }

            boundary = buffer.indexOf('\n\n');
          }
        }

        if (!terminalEvent) {
          flushNow();
          setMessages((current) =>
            current.map((item) =>
              item.id === assistantLocalId
                ? {
                    ...item,
                    pending: false,
                    error: item.error ?? 'Stream closed before completion',
                  }
                : item,
            ),
          );
          setNotice('The connection closed before the response completed.');
        }

        if (replaceAfter && newConversationId) {
          router.replace(`/c/${newConversationId}`);
        }
      } catch (error) {
        if (controller.signal.aborted) {
          flushNow();
          setMessages((current) =>
            current.map((item) =>
              item.id === assistantLocalId
                ? {
                    ...item,
                    pending: false,
                    error: item.content ? 'generation stopped' : 'stopped',
                  }
                : item,
            ),
          );
          setNotice('Generation stopped. Partial output is preserved.');
        } else {
          rollback();
          setNotice(
            error instanceof Error ? error.message : 'The request failed unexpectedly.',
          );
        }
      } finally {
        flushNow();
        activeRequestRef.current = false;
        abortRef.current = null;
        setStreamingId(null);
        setMessages((current) =>
          current.map((item) => (item.pending ? { ...item, pending: false } : item)),
        );
        void refreshConversations();
      }
    },
    [
      model,
      systemPrompt,
      initialConversation,
      router,
      refreshConversations,
      setProviderUsed,
      setUsage,
      setWorkspaceConversation,
    ],
  );

  const handleSend = useCallback(
    (attachments: LocalAttachment[]) => {
      const content = draft;
      if (!content.trim() || activeRequestRef.current) return;
      if (content.length > 32_000) {
        setNotice('Message is over the 32,000 character limit.');
        return;
      }
      setDraft('');
      void runGeneration({ message: content, attachments, addUser: true });
    },
    [draft, runGeneration],
  );

  const handleStop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const handleRegenerate = useCallback(
    (messageId: string) => {
      if (activeRequestRef.current) return;

      const index = messages.findIndex(
        (message) => message.id === messageId && message.role === 'assistant',
      );
      if (index < 0) return;

      if (index !== messages.length - 1) {
        setNotice('Only the latest response can be regenerated.');
        return;
      }

      const previousUser = [...messages.slice(0, index)]
        .reverse()
        .find((message) => message.role === 'user');
      if (!previousUser) {
        setNotice('No user turn to regenerate from.');
        return;
      }

      if (!conversationIdRef.current) {
        setNotice('There is no saved conversation to regenerate.');
        return;
      }

      setMessages((current) => current.slice(0, index));
      void runGeneration({
        message: previousUser.content,
        regenerate: true,
        addUser: false,
      });
    },
    [messages, runGeneration],
  );

  const handleEdit = useCallback((message: ChatMessageView) => {
    setDraft(message.content);
    setFocusToken((token) => token + 1);
  }, []);

  const applySuggestion = (prompt: string) => {
    setDraft(prompt);
    setFocusToken((token) => token + 1);
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <MessageList
        messages={messages}
        streamingId={streamingId}
        onRegenerate={handleRegenerate}
        onEdit={handleEdit}
        emptyState={
          <div className="flex min-h-full items-center justify-center px-5 py-12">
            <div className="w-full max-w-2xl text-center">
              <div className="relative mx-auto h-16 w-16">
                <div className="absolute inset-0 rounded-2xl bg-accent/20 blur-xl" aria-hidden="true" />
                <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl border border-border bg-panel shadow-panel">
                  <BrandLogo variant="mark" idPrefix="chat-empty" className="h-10 w-10" />
                </div>
              </div>
              <h1 className="mt-7 text-[2rem] font-semibold tracking-[-0.04em] text-fg">
                What can I help with?
              </h1>
              <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted">
                Ask a question, paste code, or start with one of these.
              </p>

              <div className="mt-8 grid gap-2.5 text-left sm:grid-cols-2">
                {SUGGESTIONS.map((suggestion) => (
                  <button
                    key={suggestion.label}
                    type="button"
                    onClick={() => applySuggestion(suggestion.prompt)}
                    className="group relative overflow-hidden rounded-xl border border-border bg-panel p-4 pr-10 text-left transition-all hover:-translate-y-0.5 hover:border-accent/30 hover:shadow-panel"
                  >
                    <span className="block text-[13px] font-medium text-fg">
                      {suggestion.label}
                    </span>
                    <span className="mt-1 block text-[10px] uppercase tracking-[0.12em] text-dim">
                      {suggestion.tag}
                    </span>
                    <ArrowUpRight className="absolute right-3.5 top-3.5 h-4 w-4 text-dim transition-all group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-accent" />
                  </button>
                ))}
              </div>

              <p className="mt-6 inline-flex items-center gap-2 rounded-full border border-border bg-panel/60 px-3 py-1.5 text-xs text-dim">
                <span className="h-1.5 w-1.5 rounded-full bg-success" />
                Using {modelLabel(model)}
              </p>
            </div>
          </div>
        }
      />

      <div className="shrink-0 bg-gradient-to-t from-bg via-bg to-bg/90">
        {notice ? (
          <div className="mx-auto w-full max-w-3xl px-4 pb-2">
            <div
              className="flex items-start gap-2 rounded-xl border border-amber/30 bg-amber/[0.06] px-3 py-2 text-xs leading-relaxed text-amber"
              role="status"
            >
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span className="min-w-0 flex-1">{notice}</span>
              <button
                type="button"
                onClick={() => setNotice(null)}
                aria-label="Dismiss notice"
                className="text-amber/70 transition-colors hover:text-amber"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        ) : null}

        <ChatInput
          value={draft}
          onChange={setDraft}
          onSend={handleSend}
          onStop={handleStop}
          streaming={streamingId !== null}
          focusToken={focusToken}
        />
      </div>
    </div>
  );
}
