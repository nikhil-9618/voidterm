import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth } from '@/lib/auth';
import { unauthorized } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const user = await requireAuth();
  if (!user) return unauthorized();

  const record = await prisma.user.findUnique({
    where: { id: user.id },
    select: { mfaEnabledAt: true, mfaRecoveryCodeHashes: true },
  });

  return NextResponse.json(
    {
      enabled: Boolean(record?.mfaEnabledAt),
      enabledAt: record?.mfaEnabledAt?.toISOString() ?? null,
      recoveryCodesRemaining: record?.mfaRecoveryCodeHashes.length ?? 0,
    },
    { headers: { 'Cache-Control': 'private, no-store' } },
  );
}
