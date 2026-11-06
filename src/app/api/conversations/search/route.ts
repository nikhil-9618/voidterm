import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireAuth } from '@/lib/auth';
import { jsonError, unauthorized } from '@/lib/http';
import { toConversationSummary } from '@/lib/dto';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const querySchema = z.object({
  q: z.string().trim().min(2).max(200),
});

/** ILIKE search over conversation titles and message bodies, scoped to the caller. */
export async function GET(request: Request) {
  const user = await requireAuth();
  if (!user) return unauthorized();

  const url = new URL(request.url);
  const parsed = querySchema.safeParse({ q: url.searchParams.get('q') ?? '' });
  if (!parsed.success) {
    return jsonError(400, 'invalid_request', 'Enter at least 2 characters to search.');
  }

  const query = parsed.data.q;

  const conversations = await prisma.conversation.findMany({
    where: {
      userId: user.id,
      OR: [
        { title: { contains: query, mode: 'insensitive' } },
        {
          messages: {
            some: { content: { contains: query, mode: 'insensitive' } },
          },
        },
      ],
    },
    orderBy: { updatedAt: 'desc' },
    take: 25,
    include: { _count: { select: { messages: true } } },
  });

  return NextResponse.json(
    {
      query,
      conversations: conversations.map(toConversationSummary),
    },
    { headers: { 'Cache-Control': 'private, no-store' } },
  );
}
