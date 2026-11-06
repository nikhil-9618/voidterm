import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireAuth } from '@/lib/auth';
import { jsonError, unauthorized } from '@/lib/http';
import { toMessageDTO } from '@/lib/dto';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteContext = { params: { id: string } };

const querySchema = z.object({
  cursor: z.string().min(1).max(64).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});

export async function GET(request: Request, { params }: RouteContext) {
  const user = await requireAuth();
  if (!user) return unauthorized();

  const url = new URL(request.url);
  const parsed = querySchema.safeParse({
    cursor: url.searchParams.get('cursor') ?? undefined,
    limit: url.searchParams.get('limit') ?? undefined,
  });

  if (!parsed.success) {
    return jsonError(400, 'invalid_request', 'Invalid pagination parameters.');
  }

  const conversation = await prisma.conversation.findFirst({
    where: { id: params.id, userId: user.id },
    select: { id: true },
  });
  if (!conversation) {
    return jsonError(404, 'not_found', 'Conversation not found.');
  }

  const { cursor, limit } = parsed.data;

  // Fetch newest→oldest, then reverse the page for chronological rendering.
  const rows = await prisma.message.findMany({
    where: { conversationId: conversation.id },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    include: { attachments: true },
  });

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore && page.length > 0 ? page[page.length - 1]?.id ?? null : null;

  return NextResponse.json(
    {
      messages: page.reverse().map(toMessageDTO),
      nextCursor,
      hasMore,
    },
    { headers: { 'Cache-Control': 'private, no-store' } },
  );
}
