import { randomBytes, createHash } from 'node:crypto';
import { cookies } from 'next/headers';
import { SignJWT, jwtVerify } from 'jose';
import { prisma } from './db';
import { env, getJwtSecret, isProduction } from './env';

export const SESSION_COOKIE = 'session';
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days
const SESSION_ISSUER = 'voidterm';
const SESSION_AUDIENCE = 'voidterm:web';

export type SessionClaims = {
  sub: string;
  sid: string;
  email: string;
  tier: number;
};

export type SessionUser = {
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  tier: number;
  sessionId: string;
  sessionExpiresAt: string;
  createdAt: string;
  lastLoginAt: string | null;
};

/**
 * The session cookie contains a signed JWT whose `sid` points at a Session row.
 * The database row remains authoritative: deleting it revokes the JWT instantly,
 * even before the 30-day JWT expiry. Session rows additionally store a SHA-256
 * hash of an independent random token (never sent to the client) so a leaked
 * database dump cannot be replayed as a cookie.
 */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export async function signSession(claims: SessionClaims): Promise<string> {
  return new SignJWT({ ...claims })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuedAt()
    .setIssuer(SESSION_ISSUER)
    .setAudience(SESSION_AUDIENCE)
    .setExpirationTime('30d')
    .sign(getJwtSecret());
}

export async function verifySession(token: string): Promise<SessionClaims | null> {
  try {
    const { payload } = await jwtVerify(token, getJwtSecret(), {
      algorithms: ['HS256'],
      issuer: SESSION_ISSUER,
      audience: SESSION_AUDIENCE,
    });

    if (
      typeof payload.sub !== 'string' ||
      typeof payload.sid !== 'string' ||
      typeof payload.email !== 'string' ||
      typeof payload.tier !== 'number'
    ) {
      return null;
    }

    return {
      sub: payload.sub,
      sid: payload.sid,
      email: payload.email,
      tier: payload.tier,
    };
  } catch {
    // Expired / tampered / wrong-key tokens are all equivalent: unauthenticated.
    return null;
  }
}

export async function createSession(
  user: { id: string; email: string; tier: number },
  meta: { userAgent?: string | null; ipAddress?: string | null } = {},
): Promise<string> {
  const rawToken = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1_000);

  const session = await prisma.session.create({
    data: {
      userId: user.id,
      tokenHash: hashToken(rawToken),
      userAgent: meta.userAgent?.slice(0, 512) ?? null,
      ipAddress: meta.ipAddress ?? null,
      expiresAt,
    },
    select: { id: true },
  });

  return signSession({
    sub: user.id,
    sid: session.id,
    email: user.email,
    tier: user.tier,
  });
}

/**
 * Read and fully verify the current session: JWT signature/claims + live
 * Session row + expiry + user binding. Any failure returns null.
 */
export async function getSessionFromCookies(): Promise<SessionUser | null> {
  let token: string | undefined;

  try {
    token = cookies().get(SESSION_COOKIE)?.value;
  } catch {
    // cookies() is unavailable in some non-request contexts (e.g. middleware).
    return null;
  }

  if (!token) return null;

  const claims = await verifySession(token);
  if (!claims) return null;

  try {
    const session = await prisma.session.findUnique({
      where: { id: claims.sid },
      include: { user: true },
    });

    if (!session) return null;
    if (session.userId !== claims.sub) return null;
    if (session.expiresAt.getTime() <= Date.now()) {
      await prisma.session.delete({ where: { id: session.id } }).catch(() => undefined);
      return null;
    }

    return {
      id: session.user.id,
      email: session.user.email,
      name: session.user.name,
      avatarUrl: session.user.avatarUrl,
      tier: session.user.tier,
      sessionId: session.id,
      sessionExpiresAt: session.expiresAt.toISOString(),
      createdAt: session.user.createdAt.toISOString(),
      lastLoginAt: session.user.lastLoginAt?.toISOString() ?? null,
    };
  } catch (error) {
    // Database unavailable should degrade to "signed out", never to an open door.
    console.error('[auth] session verification failed', error instanceof Error ? error.message : 'unknown');
    return null;
  }
}

export async function requireAuth(): Promise<SessionUser | null> {
  return getSessionFromCookies();
}

export function setSessionCookie(token: string): void {
  cookies().set({
    name: SESSION_COOKIE,
    value: token,
    httpOnly: true,
    // Browsers refuse Secure cookies over http://localhost. Production is
    // always HTTPS, so we only relax this flag for local development.
    secure: isProduction,
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_TTL_SECONDS,
    priority: 'high',
  });
}

export function clearSessionCookie(): void {
  cookies().set({
    name: SESSION_COOKIE,
    value: '',
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
}

export async function revokeSession(sessionId: string, userId: string): Promise<number> {
  const result = await prisma.session.deleteMany({ where: { id: sessionId, userId } });
  return result.count;
}

export async function revokeAllSessions(userId: string, exceptSessionId?: string): Promise<number> {
  const result = await prisma.session.deleteMany({
    where: { userId, ...(exceptSessionId ? { id: { not: exceptSessionId } } : {}) },
  });
  return result.count;
}

/** Canonical app origin used for absolute links in emails/docs. */
export function appOrigin(): string {
  return env.NEXT_PUBLIC_APP_URL.replace(/\/$/, '');
}
