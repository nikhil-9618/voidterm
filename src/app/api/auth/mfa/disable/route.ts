import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { audit } from '@/lib/audit';
import { requireAuth } from '@/lib/auth';
import { csrfRejected, isSameOrigin, jsonError, readJson, unauthorized } from '@/lib/http';
import {
  decryptTotpSecret,
  findRecoveryCodeHash,
  verifyTotpCode,
} from '@/lib/mfa';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  code: z.string().trim().min(6).max(20),
});

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return csrfRejected();

  const user = await requireAuth();
  if (!user) return unauthorized();

  const parsed = bodySchema.safeParse(await readJson(request));
  if (!parsed.success) {
    return jsonError(400, 'invalid_code', 'Enter a current authenticator or recovery code.');
  }

  const record = await prisma.user.findUnique({
    where: { id: user.id },
    select: { mfaSecret: true, mfaEnabledAt: true, mfaRecoveryCodeHashes: true },
  });

  if (!record?.mfaEnabledAt || !record.mfaSecret) {
    return jsonError(409, 'mfa_not_enabled', 'Two-factor authentication is not enabled.');
  }

  const secret = decryptTotpSecret(record.mfaSecret);
  const submitted = parsed.data.code.trim();
  const totpValid = Boolean(secret) && verifyTotpCode(secret as string, submitted);
  const recoveryHash = await findRecoveryCodeHash(submitted, record.mfaRecoveryCodeHashes);

  if (!totpValid && !recoveryHash) {
    await audit('auth.mfa_disable_failed', user.id);
    return jsonError(400, 'invalid_code', 'That code did not match.');
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      mfaSecret: null,
      mfaEnabledAt: null,
      mfaRecoveryCodeHashes: [],
    },
  });

  await audit('auth.mfa_disabled', user.id, { viaRecoveryCode: Boolean(recoveryHash) });

  return NextResponse.json({ ok: true });
}
