import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { audit } from '@/lib/audit';
import { requireAuth } from '@/lib/auth';
import { csrfRejected, isSameOrigin, jsonError, unauthorized } from '@/lib/http';
import { buildOtpAuthUrl, encryptTotpSecret, generateTotpSecret } from '@/lib/mfa';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Generate a pending TOTP secret. It is not active until the user proves they
 * can produce a valid code (see /api/auth/mfa/enable).
 */
export async function POST(request: Request) {
  if (!isSameOrigin(request)) return csrfRejected();

  const user = await requireAuth();
  if (!user) return unauthorized();

  const record = await prisma.user.findUnique({
    where: { id: user.id },
    select: { mfaEnabledAt: true },
  });

  if (record?.mfaEnabledAt) {
    return jsonError(409, 'mfa_already_enabled', 'Two-factor authentication is already enabled.');
  }

  const secret = generateTotpSecret();
  const encrypted = encryptTotpSecret(secret);

  await prisma.user.update({
    where: { id: user.id },
    data: { mfaSecret: encrypted, mfaRecoveryCodeHashes: [] },
  });

  await audit('auth.mfa_setup_started', user.id);

  return NextResponse.json(
    {
      secret,
      otpauthUrl: buildOtpAuthUrl(user.email, secret),
      digits: 6,
      period: 30,
    },
    { headers: { 'Cache-Control': 'private, no-store' } },
  );
}
