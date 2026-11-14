import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { audit } from '@/lib/audit';
import { createSession, setSessionCookie } from '@/lib/auth';
import { getClientIp, mfaUserLimiter, mfaVerifyLimiter } from '@/lib/rate-limit';
import { csrfRejected, isSameOrigin, jsonError, rateLimited, readJson } from '@/lib/http';
import {
  decryptTotpSecret,
  findRecoveryCodeHash,
  verifyMfaChallenge,
  verifyTotpCode,
} from '@/lib/mfa';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  challenge: z.string().min(20).max(2_048),
  code: z.string().trim().min(6).max(20),
});

const GENERIC_FAILURE = 'Invalid or expired verification code.';

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return csrfRejected();

  const parsed = bodySchema.safeParse(await readJson(request));
  if (!parsed.success) {
    return jsonError(400, 'invalid_code', GENERIC_FAILURE);
  }

  const ipAddress = getClientIp(request);
  const limit = await mfaVerifyLimiter.limit(ipAddress);
  if (!limit.success) return rateLimited(limit.reset);

  const userId = await verifyMfaChallenge(parsed.data.challenge);
  if (!userId) {
    return jsonError(400, 'invalid_code', GENERIC_FAILURE);
  }

  // Per-account limit in addition to the per-IP limit: a leaked challenge is
  // not enough to brute force a six-digit code from many addresses.
  const userLimit = await mfaUserLimiter.limit(userId);
  if (!userLimit.success) return rateLimited(userLimit.reset);

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      name: true,
      tier: true,
      mfaSecret: true,
      mfaEnabledAt: true,
      mfaRecoveryCodeHashes: true,
    },
  });

  // A challenge minted before MFA was disabled must not bypass the passwordless
  // flow: without an enabled factor, restart from the email code.
  if (!user || !user.mfaEnabledAt || !user.mfaSecret) {
    return jsonError(400, 'invalid_code', GENERIC_FAILURE);
  }

  const secret = decryptTotpSecret(user.mfaSecret);
  const submitted = parsed.data.code.trim();
  const totpValid = Boolean(secret) && verifyTotpCode(secret as string, submitted);
  const recoveryHash = totpValid
    ? null
    : await findRecoveryCodeHash(submitted, user.mfaRecoveryCodeHashes);

  if (!totpValid && !recoveryHash) {
    await audit('auth.mfa_failed', user.id, { ip: ipAddress });
    return jsonError(400, 'invalid_code', GENERIC_FAILURE);
  }

  if (recoveryHash) {
    // Atomic single-use consumption: only one concurrent request can remove
    // the hash, and a replay finds it gone.
    const consumed = await prisma.$executeRaw(
      Prisma.sql`
        UPDATE "User"
        SET "mfaRecoveryCodeHashes" = array_remove("mfaRecoveryCodeHashes", ${recoveryHash})
        WHERE "id" = ${user.id}
          AND ${recoveryHash} = ANY("mfaRecoveryCodeHashes")
      `,
    );

    if (consumed !== 1) {
      return jsonError(400, 'invalid_code', GENERIC_FAILURE);
    }
  }

  const sessionToken = await createSession(
    { id: user.id, email: user.email, tier: user.tier },
    {
      userAgent: request.headers.get('user-agent'),
      ipAddress,
    },
  );

  setSessionCookie(sessionToken);

  await audit('auth.login', user.id, {
    ip: ipAddress,
    method: recoveryHash ? 'email_otp+recovery_code' : 'email_otp+totp',
  });

  return NextResponse.json({
    ok: true,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      tier: user.tier,
    },
  });
}
