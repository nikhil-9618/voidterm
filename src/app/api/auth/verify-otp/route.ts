import { NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { createSession, setSessionCookie } from '@/lib/auth';
import { getClientIp, otpVerifyLimiter } from '@/lib/rate-limit';
import { csrfRejected, isSameOrigin, jsonError, rateLimited, readJson } from '@/lib/http';
import { audit } from '@/lib/audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  email: z.string().trim().email().max(254),
  otp: z.string().regex(/^\d{6}$/),
});

const MAX_ATTEMPTS = 5;
const GENERIC_FAILURE = 'Invalid or expired code.';

class ConsumedCodeError extends Error {}

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return csrfRejected();

  const parsed = bodySchema.safeParse(await readJson(request));
  if (!parsed.success) {
    return jsonError(400, 'invalid_code', GENERIC_FAILURE);
  }

  const email = parsed.data.email.toLowerCase();
  const ipAddress = getClientIp(request);

  const verifyLimit = await otpVerifyLimiter.limit(ipAddress);
  if (!verifyLimit.success) return rateLimited(verifyLimit.reset);

  const code = await prisma.otpCode.findFirst({
    where: { email, usedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: 'desc' },
  });

  if (!code || code.attempts >= MAX_ATTEMPTS) {
    return jsonError(400, 'invalid_code', GENERIC_FAILURE);
  }

  // bcrypt.compare is the constant-time comparison; we never compare strings.
  const matches = await bcrypt.compare(parsed.data.otp, code.otpHash);

  if (!matches) {
    // Count the failed attempt. Once attempts hit 5, the code is unusable even
    // though it remains in the table until expiry/cleanup.
    await prisma.otpCode
      .update({ where: { id: code.id }, data: { attempts: { increment: 1 } } })
      .catch(() => undefined);

    await audit('auth.otp_failed', null, {
      ip: ipAddress,
      emailHash: createHash('sha256').update(email).digest('hex').slice(0, 16),
    });

    return jsonError(400, 'invalid_code', GENERIC_FAILURE);
  }

  // Consume + provision the account atomically. The conditional updateMany
  // makes the code single-use even under concurrent requests.
  let user: { id: string; email: string; tier: number; name: string | null } | null = null;
  try {
    user = await prisma.$transaction(async (tx) => {
      const consumed = await tx.otpCode.updateMany({
        where: {
          id: code.id,
          usedAt: null,
          attempts: { lt: MAX_ATTEMPTS },
          expiresAt: { gt: new Date() },
        },
        data: { usedAt: new Date() },
      });

      if (consumed.count !== 1) throw new ConsumedCodeError();

      return tx.user.upsert({
        where: { email },
        update: { lastLoginAt: new Date() },
        create: { email, lastLoginAt: new Date() },
        select: { id: true, email: true, tier: true, name: true },
      });
    });
  } catch (error) {
    if (error instanceof ConsumedCodeError) {
      return jsonError(400, 'invalid_code', GENERIC_FAILURE);
    }
    console.error('[auth] verify transaction failed:', error instanceof Error ? error.message : 'unknown');
    return jsonError(500, 'server_error', 'Could not complete sign-in. Try again.');
  }

  if (!user) {
    return jsonError(400, 'invalid_code', GENERIC_FAILURE);
  }

  const sessionToken = await createSession(
    { id: user.id, email: user.email, tier: user.tier },
    {
      userAgent: request.headers.get('user-agent'),
      ipAddress,
    },
  );

  setSessionCookie(sessionToken);

  await audit('auth.login', user.id, { ip: ipAddress, method: 'email_otp' });

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
