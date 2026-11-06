import { NextResponse } from 'next/server';
import { clearSessionCookie, requireAuth, revokeAllSessions } from '@/lib/auth';
import { csrfRejected, isSameOrigin, unauthorized } from '@/lib/http';
import { audit } from '@/lib/audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Revoke every session for the caller, including the current one. */
export async function POST(request: Request) {
  if (!isSameOrigin(request)) return csrfRejected();

  const user = await requireAuth();
  if (!user) return unauthorized();

  const revoked = await revokeAllSessions(user.id);
  clearSessionCookie();
  await audit('auth.logout_all', user.id, { revoked });

  return NextResponse.json({ ok: true, revoked });
}
