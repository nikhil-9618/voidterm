import { NextResponse } from 'next/server';
import { z } from 'zod';
import { clearSessionCookie, requireAuth, revokeSession } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { csrfRejected, isSameOrigin, jsonError, readJson, unauthorized } from '@/lib/http';
import { audit } from '@/lib/audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** List the caller's active sessions. tokenHash is never exposed. */
export async function GET() {
  const user = await requireAuth();
  if (!user) return unauthorized();

  const sessions = await prisma.session.findMany({
    where: { userId: user.id, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      userAgent: true,
      ipAddress: true,
      createdAt: true,
      expiresAt: true,
    },
  });

  return NextResponse.json(
    {
      sessions: sessions.map((session) => ({
        ...session,
        current: session.id === user.sessionId,
      })),
    },
    { headers: { 'Cache-Control': 'private, no-store' } },
  );
}

const deleteSchema = z.object({ id: z.string().min(1).max(64) });

/** Revoke a specific session that belongs to the caller. */
export async function DELETE(request: Request) {
  if (!isSameOrigin(request)) return csrfRejected();

  const user = await requireAuth();
  if (!user) return unauthorized();

  const url = new URL(request.url);
  const body = await readJson(request);
  const candidate = body ?? { id: url.searchParams.get('id') ?? '' };
  const parsed = deleteSchema.safeParse(candidate);

  if (!parsed.success) {
    return jsonError(400, 'invalid_request', 'A session id is required.');
  }

  const revoked = await revokeSession(parsed.data.id, user.id);
  if (revoked === 0) {
    return jsonError(404, 'not_found', 'Session not found.');
  }

  if (parsed.data.id === user.sessionId) {
    clearSessionCookie();
  }

  await audit('auth.session_revoked', user.id, { sessionId: parsed.data.id });
  return NextResponse.json({ ok: true });
}
