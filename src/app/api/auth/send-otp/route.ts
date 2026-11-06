import { NextResponse } from 'next/server';
import { randomInt } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { getClientIp, otpEmailLimiter, otpIpLimiter } from '@/lib/rate-limit';
import { csrfRejected, isSameOrigin, jsonError, rateLimited, readJson } from '@/lib/http';
import { sendOtpEmail } from '@/lib/email/otp';
import { audit } from '@/lib/audit';
import { isProduction } from '@/lib/env';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  email: z.string().trim().email().max(254),
});

// Identical response for registered / unregistered addresses: this endpoint must
// never become an account-existence oracle.
const GENERIC_MESSAGE = 'If that email is registered, a code was sent.';
const OTP_TTL_MS = 10 * 60 * 1_000;

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return csrfRejected();

  const parsed = bodySchema.safeParse(await readJson(request));
  if (!parsed.success) {
    return jsonError(400, 'invalid_request', 'Enter a valid email address.');
  }

  const email = parsed.data.email.toLowerCase();
  const ipAddress = getClientIp(request);

  // Burst protection before any expensive work. Both windows are generic and
  // independent of whether the address exists.
  const [emailLimit, ipLimit] = await Promise.all([
    otpEmailLimiter.limit(email),
    otpIpLimiter.limit(ipAddress),
  ]);

  if (!emailLimit.success) return rateLimited(emailLimit.reset);
  if (!ipLimit.success) return rateLimited(ipLimit.reset);

  const code = randomInt(0, 1_000_000).toString().padStart(6, '0');

  // OTPs are stored bcrypt-hashed (cost 10): a database read cannot recover a
  // live code. The plaintext exists only in this request and in the email.
  const otpHash = await bcrypt.hash(code, 10);

  const existingUser = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });

  // Invalidate every previous unused code for this address so only the most
  // recent code can ever be consumed.
  await prisma.$transaction([
    prisma.otpCode.deleteMany({ where: { email, usedAt: null } }),
    prisma.otpCode.create({
      data: {
        email,
        otpHash,
        expiresAt: new Date(Date.now() + OTP_TTL_MS),
        ipAddress,
        userId: existingUser?.id ?? null,
      },
    }),
  ]);

  const result = await sendOtpEmail({ to: email, otp: code });

  // Never persist or log the OTP itself. Metadata only.
  await audit('auth.otp_requested', existingUser?.id ?? null, {
    ip: ipAddress,
    delivered: result.delivered,
  });

  return NextResponse.json(
    {
      ok: true,
      message: GENERIC_MESSAGE,
      // Safe to expose in development only: confirms the code went to the
      // server console instead of an inbox. The code itself is never returned.
      ...(isProduction ? {} : { dev: result.devLogged }),
    },
    { status: 200 },
  );
}
