import { NextResponse } from 'next/server';
import { getVercelOidcToken } from '@vercel/oidc';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireAuth } from '@/lib/auth';
import { chatLimiter } from '@/lib/rate-limit';
import {
  csrfRejected,
  isSameOrigin,
  jsonError,
  rateLimited,
  readJson,
  unauthorized,
} from '@/lib/http';
import { audit } from '@/lib/audit';
import { classifyIntent } from '@/lib/ai/intent';
import { getPolicyForIntent, refusalMessage } from '@/lib/ai/policy';
import { buildSystemPrompt } from '@/lib/ai/safety-prompts';
import { streamWithFallback } from '@/lib/ai/fallback';
import { getModelSpec, isSupportedModel } from '@/lib/ai/models';
import { deriveConversationTitle } from '@/lib/dto';
import { estimateTokens } from '@/lib/utils';
import type { ChatMessage, TokenUsage } from '@/lib/ai/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const attachmentInputSchema = z.object({
  fileUrl: z
    .string()
    .min(1)
    .max(2_048)
    .refine(
      (value) => value.startsWith('/') || /^https?:\/\//i.test(value),
      'Attachment URL must be local or http(s).',
    ),
  fileType: z.string().min(1).max(128),
  fileSize: z.number().int().nonnegative().max(10 * 1024 * 1024),
  fileName: z.string().max(255).optional(),
});

const bodySchema = z.object({
  conversationId: z.string().min(1).max(64).optional(),
  message: z.string().min(1).max(32_000),
  model: z.string().min(1).max(128).refine(isSupportedModel, 'Unsupported model.'),
  systemPrompt: z.string().max(8_000).optional(),
  // Regenerate the latest assistant turn without writing a duplicate user row.
  regenerate: z.boolean().optional(),
  attachments: z.array(attachmentInputSchema).max(6).optional(),
});

type ConversationRow = { id: string; title: string; systemPrompt: string | null };
type HistoryRow = { id: string; role: string; content: string };

function sseChunk(payload: unknown): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(payload)}\n\n`);
}

function toChatMessage(entry: HistoryRow): ChatMessage {
  return {
    role: entry.role === 'assistant' || entry.role === 'system' ? entry.role : 'user',
    content: entry.content,
  };
}

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return csrfRejected();

  const user = await requireAuth();
  if (!user) return unauthorized();

  const parsed = bodySchema.safeParse(await readJson(request));
  if (!parsed.success) {
    return jsonError(400, 'invalid_request', 'Invalid request payload.', {
      issues: parsed.error.flatten().fieldErrors,
    });
  }

  const { conversationId, message, model, systemPrompt, regenerate, attachments } = parsed.data;

  // Vercel Functions expose the short-lived OIDC token on the request itself,
  // not through process.env. Capture it while the request context is available
  // so the AI Gateway provider can authenticate the upstream call. The helper
  // covers runtimes that expose the token through the request context instead
  // of forwarding the header to every route handler.
  let oidcToken = request.headers.get('x-vercel-oidc-token')?.trim() || undefined;
  if (!oidcToken) {
    try {
      oidcToken = await getVercelOidcToken();
    } catch {
      // Leave the token undefined; the provider will report the configuration
      // error and the final error will include the missing-token marker.
    }
  }

  if (regenerate && !conversationId) {
    return jsonError(400, 'invalid_request', 'A conversation is required to regenerate a response.');
  }

  // Global per-user throughput guard. Authenticated users have no daily message
  // cap; this only prevents runaway automation.
  const limit = await chatLimiter.limit(user.id);
  if (!limit.success) return rateLimited(limit.reset);

  const modelSpec = getModelSpec(model);
  if (!modelSpec) return jsonError(400, 'invalid_model', 'Unsupported model.');

  // ── Policy gate ────────────────────────────────────────────
  // Classify BEFORE writing anything, so a refused request does not create an
  // empty conversation or a persisted user message. The local gate resolves
  // ordinary questions immediately; only targeted-harm candidates use the model.
  const classification = await classifyIntent(message, user.tier);
  const policy = getPolicyForIntent(classification.intent, user.tier);

  if (!policy.allowed) {
    await audit('chat.policy_blocked', user.id, {
      intent: classification.intent,
      model,
      requiresLogin: policy.requiresLogin,
    });

    if (policy.requiresLogin) {
      return jsonError(403, 'login_required', 'Log in to see the full technical answer.');
    }

    return jsonError(400, 'refused', refusalMessage(classification.intent), {
      intent: classification.intent,
    });
  }

  if (user.tier >= 3) {
    await audit('tier3.access', user.id, { model, conversationId: conversationId ?? null });
  }

  // An explicitly-supplied prompt (even an empty string) is the user's intent:
  // empty means "use the default tier-2 prompt", and the stored override is cleared.
  const hasExplicitSystemPrompt = systemPrompt !== undefined;

  // ── Conversation ownership / creation ──────────────────────
  let conversation: ConversationRow;
  let priorHistory: HistoryRow[] = [];
  let regenerateTargetId: string | undefined;
  let userMessagePromise: Promise<unknown> | null = null;
  let isNewConversation = false;

  if (conversationId) {
    // Ownership and history are independent reads, so overlap them. The
    // relation filter keeps the history query scoped to the signed-in user.
    const [existing, recent] = await Promise.all([
      prisma.conversation.findFirst({
        where: { id: conversationId, userId: user.id },
        select: { id: true, title: true, systemPrompt: true },
      }),
      prisma.message.findMany({
        where: {
          conversationId,
          conversation: { is: { userId: user.id } },
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 30,
        select: { id: true, role: true, content: true },
      }),
    ]);

    if (!existing) {
      return jsonError(404, 'not_found', 'Conversation not found.');
    }

    conversation = existing;
    priorHistory = recent.slice().reverse();
  } else {
    // Creating the conversation and its opening turn in one write removes two
    // sequential database round trips from the first-message path.
    isNewConversation = true;
    const created = await prisma.conversation.create({
      data: {
        userId: user.id,
        title: deriveConversationTitle(message),
        model,
        systemPrompt: systemPrompt?.trim() || null,
        tier: user.tier,
        messages: {
          create: {
            role: 'user',
            content: message,
            model,
            intentClass: classification.intent,
            tokens: estimateTokens(message),
            ...(attachments && attachments.length > 0
              ? {
                  attachments: {
                    create: attachments.map((attachment) => ({
                      fileUrl: attachment.fileUrl,
                      fileType: attachment.fileType,
                      fileSize: attachment.fileSize,
                    })),
                  },
                }
              : {}),
          },
        },
      },
      select: { id: true, title: true, systemPrompt: true },
    });

    conversation = created;
  }

  // Regeneration replaces the latest assistant turn in place. Keeping the row
  // (rather than creating a second answer) prevents duplicate responses after a
  // reload and preserves the old answer if every provider fails before a token.
  if (regenerate) {
    const latest = priorHistory[priorHistory.length - 1];
    if (!latest || latest.role !== 'assistant') {
      return jsonError(400, 'nothing_to_regenerate', 'There is no response to regenerate.');
    }
    regenerateTargetId = latest.id;

    // Drop trailing assistant turns so the model actually regenerates instead of
    // continuing from its own previous answer.
    while (priorHistory.length > 0 && priorHistory[priorHistory.length - 1]?.role === 'assistant') {
      priorHistory.pop();
    }
  }

  if (!regenerate && !isNewConversation) {
    // Start the write immediately, but do not await it before opening the
    // provider stream. It normally completes while the model is thinking.
    userMessagePromise = prisma.message
      .create({
        data: {
          conversationId: conversation.id,
          role: 'user',
          content: message,
          model,
          intentClass: classification.intent,
          tokens: estimateTokens(message),
          ...(attachments && attachments.length > 0
            ? {
                attachments: {
                  create: attachments.map((attachment) => ({
                    fileUrl: attachment.fileUrl,
                    fileType: attachment.fileType,
                    fileSize: attachment.fileSize,
                  })),
                },
              }
            : {}),
        },
      })
      .catch((error) => {
        console.error(
          '[chat] failed to persist user message:',
          error instanceof Error ? error.message : 'unknown',
        );
        return null;
      });
  }

  // ── Build bounded history (last 30 turns) ──────────────────
  let chatMessages: ChatMessage[];

  if (regenerate) {
    if (priorHistory.length === 0) {
      return jsonError(400, 'nothing_to_regenerate', 'There is no message to regenerate.');
    }
    chatMessages = priorHistory.map(toChatMessage);
  } else if (isNewConversation) {
    chatMessages = [{ role: 'user', content: message }];
  } else {
    // 29 prior turns + the current one = the same 30-turn window as before.
    chatMessages = [
      ...priorHistory.slice(-29).map(toChatMessage),
      { role: 'user', content: message },
    ];
  }

  const effectiveSystemPrompt = hasExplicitSystemPrompt
    ? systemPrompt.trim() || undefined
    : conversation.systemPrompt || undefined;

  const systemPromptText = buildSystemPrompt({
    userSystemPrompt: effectiveSystemPrompt,
    responseModifier: policy.responseModifier,
    highRisk: classification.intent === 'high_risk',
  });

  // ── Stream ─────────────────────────────────────────────────
  const abortController = new AbortController();
  let aborted = false;

  const sseStream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;

      const close = () => {
        if (closed) return;
        closed = true;
        try {
          controller.close();
        } catch {
          // Controller was already cancelled by the client.
        }
      };

      const send = (payload: unknown) => {
        if (closed || aborted) return;
        try {
          controller.enqueue(sseChunk(payload));
        } catch {
          aborted = true;
        }
      };

      const onAbort = () => {
        aborted = true;
        abortController.abort();
      };
      request.signal.addEventListener('abort', onAbort);

      let assistantContent = '';
      let usage: TokenUsage | undefined;
      let providerUsed: string | undefined;
      let streamError: string | undefined;
      let savedMessageId: string | undefined;

      try {
        for await (const chunk of streamWithFallback(modelSpec.provider, chatMessages, {
          model,
          systemPrompt: systemPromptText,
          temperature: 0.7,
          maxTokens: 4_096,
          signal: abortController.signal,
          oidcToken,
        })) {
          if (aborted) break;

          if (chunk.providerUsed) providerUsed = chunk.providerUsed;

          if (chunk.type === 'token' && chunk.token) {
            assistantContent += chunk.token;
            send({ type: 'token', token: chunk.token });
            continue;
          }

          if (chunk.type === 'done') {
            usage = chunk.usage;
            break;
          }

          if (chunk.type === 'error') {
            streamError = chunk.error ?? 'Provider error';
            break;
          }
        }
      } catch (error) {
        streamError = error instanceof Error ? error.message : 'Stream failed';
      } finally {
        request.signal.removeEventListener('abort', onAbort);
      }

      // Persist even partial content when the client disconnects mid-stream.
      // On regenerate, update the existing assistant turn in place so a reload
      // never shows the previous answer and its replacement side by side.
      const conversationUpdate = prisma.conversation
        .update({
          where: { id: conversation.id },
          data: {
            updatedAt: new Date(),
            model,
            tier: user.tier,
            ...(conversation.title === 'New chat' && !regenerate
              ? { title: deriveConversationTitle(message) }
              : {}),
            ...(hasExplicitSystemPrompt ? { systemPrompt: systemPrompt.trim() || null } : {}),
          },
        })
        .catch((error) => {
          console.error(
            '[chat] failed to update conversation:',
            error instanceof Error ? error.message : 'unknown',
          );
        });

      let assistantSave: Promise<void> | null = null;

      if (assistantContent.trim().length > 0) {
        assistantSave = (async () => {
          // Preserve message order when the user write is still in flight.
          if (userMessagePromise) await userMessagePromise;

          if (regenerateTargetId) {
            await prisma.message.update({
              where: { id: regenerateTargetId },
              data: {
                content: assistantContent,
                model,
                intentClass: classification.intent,
                tokens: usage?.completionTokens ?? estimateTokens(assistantContent),
              },
            });
            savedMessageId = regenerateTargetId;
          } else {
            const saved = await prisma.message.create({
              data: {
                conversationId: conversation.id,
                role: 'assistant',
                content: assistantContent,
                model,
                intentClass: classification.intent,
                tokens: usage?.completionTokens ?? estimateTokens(assistantContent),
              },
              select: { id: true },
            });
            savedMessageId = saved.id;
          }
        })().catch((error) => {
          console.error(
            '[chat] failed to persist assistant message:',
            error instanceof Error ? error.message : 'unknown',
          );
        });
      }

      await Promise.all([conversationUpdate, assistantSave ?? Promise.resolve()]);

      if (aborted) {
        // The client is gone; there is nowhere to write. The partial answer has
        // already been persisted above.
        close();
        return;
      }

      if (streamError) {
        send({
          type: 'error',
          error: streamError,
          conversationId: conversation.id,
          messageId: savedMessageId,
        });
        close();
        return;
      }

      send({
        type: 'done',
        conversationId: conversation.id,
        messageId: savedMessageId,
        providerUsed,
        usage,
        model,
        intent: classification.intent,
      });

      close();
    },

    cancel() {
      // Fires when the browser closes the connection or the consumer stops
      // reading. Abort the upstream provider immediately.
      aborted = true;
      abortController.abort();
    },
  });

  return new NextResponse(sseStream, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
