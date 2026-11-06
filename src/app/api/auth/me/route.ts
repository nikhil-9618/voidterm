import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { unauthorized } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const user = await requireAuth();
  if (!user) return unauthorized();

  return NextResponse.json(
    {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        avatarUrl: user.avatarUrl,
        tier: user.tier,
        createdAt: user.createdAt,
        lastLoginAt: user.lastLoginAt,
      },
      session: {
        id: user.sessionId,
        expiresAt: user.sessionExpiresAt,
      },
    },
    { headers: { 'Cache-Control': 'private, no-store' } },
  );
}
