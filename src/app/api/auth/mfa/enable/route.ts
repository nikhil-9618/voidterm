import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { audit } from '@/lib/audit';
import { requireAuth } from '@/lib/auth';
import { csrfRejected, isSameOrigin, jsonError, readJson, unauthorized } from '@/lib/http';
import {
  decryptTotpSecret,
  generateRecoveryCodes,
  hashRecoveryCode,
  verifyTotpCode,
} from '@/lib/mfa';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const bodySchema = z.object({ code: z.string().regex(/^\d{6}$/) });

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return csrfRejected();

  const user = await requireAuth();
  if (!user) return unauthorized();

  const parsed = bodySchema.safeParse(await readJson(request));
  if (!parsed.success) {
    return jsonError(400, 'invalid_code', 'Enter the six-digit code from your authenticator.');
  }

  const record = await prisma.user.findUnique({
    where: { id: user.id },
    select: { mfaSecret: true, mfaEnabledAt: true },
  });

  if (record?.mfaEnabledAt) {
    return jsonError(409, 'mfa_already_enabled', 'Two-factor authentication is already enabled.');
  }
  if (!record?.mfaSecret) {
    return jsonError(400, 'setup_expired', 'Start two-factor setup again.');
  }

  const secret = decryptTotpSecret(record.mfaSecret);
  if (!secret || !verifyTotpCode(secret, parsed.data.code)) {
    return jsonError(400, 'invalid_code', 'That code did not match. Check your device clock.');
  }

  const recoveryCodes = generateRecoveryCodes();
  const recoveryCodeHashes = await Promise.all(recoveryCodes.map(hashRecoveryCode));

  await prisma.user.update({
    where: { id: user.id },
    data: {
      mfaEnabledAt: new Date(),
      mfaRecoveryCodeHashes: recoveryCodeHashes,
    },
  });

  await audit('auth.mfa_enabled', user.id, { recoveryCodes: recoveryCodes.length });

  return NextResponse.json(
    {
      ok: true,
      recoveryCodes,
    },
    { headers: { 'Cache-Control': 'private, no-store' } },
  );
}
