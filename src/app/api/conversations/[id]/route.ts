import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { audit } from '@/lib/audit';
import { requireAuth } from '@/lib/auth';
import { csrfRejected, isSameOrigin, jsonError, readJson, unauthorized } from '@/lib/http';
import { toConversationDetail } from '@/lib/dto';
import { isSupportedModel } from '@/lib/ai/models';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteContext = { params: { id: string } };

/** Fetch one conversation with all messages and attachments. */
export async function GET(_request: Request, { params }: RouteContext) {
  const user = await requireAuth();
  if (!user) return unauthorized();

  const conversation = await prisma.conversation.findFirst({
    where: { id: params.id, userId: user.id },
    include: {
      messages: {
        orderBy: { createdAt: 'asc' },
        include: { attachments: true },
      },
    },
  });

  if (!conversation) {
    return jsonError(404, 'not_found', 'Conversation not found.');
  }

  return NextResponse.json(
    { conversation: toConversationDetail(conversation) },
    { headers: { 'Cache-Control': 'private, no-store' } },
  );
}

const updateSchema = z
  .object({
    title: z.string().trim().min(1).max(120).optional(),
    model: z.string().min(1).max(128).refine(isSupportedModel, 'Unsupported model.').optional(),
    systemPrompt: z.string().max(8_000).nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, 'No fields to update.');

/** Rename / retitle / change the model or system prompt. */
export async function PATCH(request: Request, { params }: RouteContext) {
  if (!isSameOrigin(request)) return csrfRejected();

  const user = await requireAuth();
  if (!user) return unauthorized();

  const parsed = updateSchema.safeParse(await readJson(request));
  if (!parsed.success) {
    return jsonError(400, 'invalid_request', 'Invalid update payload.');
  }

  // Ownership check is the RLS-equivalent: id + userId in one query.
  const existing = await prisma.conversation.findFirst({
    where: { id: params.id, userId: user.id },
    select: { id: true },
  });
  if (!existing) return jsonError(404, 'not_found', 'Conversation not found.');

  const conversation = await prisma.conversation.update({
    where: { id: existing.id },
    data: {
      ...(parsed.data.title !== undefined ? { title: parsed.data.title } : {}),
      ...(parsed.data.model !== undefined ? { model: parsed.data.model } : {}),
      ...(parsed.data.systemPrompt !== undefined
        ? { systemPrompt: parsed.data.systemPrompt?.trim() || null }
        : {}),
    },
    include: {
      messages: {
        orderBy: { createdAt: 'asc' },
        include: { attachments: true },
      },
    },
  });

  return NextResponse.json({ conversation: toConversationDetail(conversation) });
}

/** Hard delete. Cascades messages, attachments, and audit rows are retained. */
export async function DELETE(request: Request, { params }: RouteContext) {
  if (!isSameOrigin(request)) return csrfRejected();

  const user = await requireAuth();
  if (!user) return unauthorized();

  const existing = await prisma.conversation.findFirst({
    where: { id: params.id, userId: user.id },
    select: { id: true },
  });
  if (!existing) return jsonError(404, 'not_found', 'Conversation not found.');

  await prisma.conversation.delete({ where: { id: existing.id } });
  await audit('conversation.deleted', user.id, { conversationId: existing.id });
  return NextResponse.json({ ok: true, id: existing.id });
}

