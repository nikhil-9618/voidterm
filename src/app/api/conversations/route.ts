import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireAuth } from '@/lib/auth';
import { csrfRejected, isSameOrigin, jsonError, readJson, unauthorized } from '@/lib/http';
import { toConversationSummary } from '@/lib/dto';
import { DEFAULT_MODEL, isSupportedModel } from '@/lib/ai/models';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** List the caller's conversations, newest first. */
export async function GET() {
  const user = await requireAuth();
  if (!user) return unauthorized();

  const conversations = await prisma.conversation.findMany({
    where: { userId: user.id },
    orderBy: { updatedAt: 'desc' },
    take: 200,
    include: { _count: { select: { messages: true } } },
  });

  return NextResponse.json(
    { conversations: conversations.map(toConversationSummary) },
    { headers: { 'Cache-Control': 'private, no-store' } },
  );
}

const createSchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  model: z.string().min(1).max(128).refine(isSupportedModel, 'Unsupported model.').optional(),
  systemPrompt: z.string().max(8_000).optional(),
});

/** Create an empty conversation (used by the explicit "new chat" button). */
export async function POST(request: Request) {
  if (!isSameOrigin(request)) return csrfRejected();

  const user = await requireAuth();
  if (!user) return unauthorized();

  const parsed = createSchema.safeParse(await readJson(request));
  if (!parsed.success) {
    return jsonError(400, 'invalid_request', 'Invalid conversation payload.');
  }

  const conversation = await prisma.conversation.create({
    data: {
      userId: user.id,
      title: parsed.data.title ?? 'New chat',
      model: parsed.data.model ?? DEFAULT_MODEL,
      systemPrompt: parsed.data.systemPrompt?.trim() || null,
      tier: user.tier,
    },
    include: { _count: { select: { messages: true } } },
  });

  return NextResponse.json(
    { conversation: toConversationSummary(conversation) },
    { status: 201 },
  );
}
