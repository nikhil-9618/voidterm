import { NextResponse } from 'next/server';
import { clearSessionCookie, requireAuth, revokeSession } from '@/lib/auth';
import { csrfRejected, isSameOrigin } from '@/lib/http';
import { audit } from '@/lib/audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return csrfRejected();

  const user = await requireAuth();

  if (user) {
    await revokeSession(user.sessionId, user.id).catch(() => undefined);
    await audit('auth.logout', user.id);
  }

  clearSessionCookie();
  return NextResponse.json({ ok: true });
}
