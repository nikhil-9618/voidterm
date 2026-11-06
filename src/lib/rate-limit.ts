import { Prisma } from '@prisma/client';
import { Ratelimit } from '@upstash/ratelimit';
import { prisma } from './db';
import { isProduction } from './env';
import { getRedis } from './redis';

export type RateLimitResult = {
  success: boolean;
  remaining: number;
  /** Unix timestamp (ms) at which the current window resets. */
  reset: number;
};

type Limiter = {
  limit: (key: string) => Promise<RateLimitResult>;
};

type MemoryBucket = { hits: number[] };

const memoryBuckets = new Map<string, MemoryBucket>();
let databaseFailureLogged = false;

function memoryLimit(key: string, max: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  const cutoff = now - windowMs;
  const bucket = memoryBuckets.get(key) ?? { hits: [] };
  bucket.hits = bucket.hits.filter((timestamp) => timestamp > cutoff);

  if (bucket.hits.length >= max) {
    const oldest = bucket.hits[0] ?? now;
    memoryBuckets.set(key, bucket);
    return { success: false, remaining: 0, reset: oldest + windowMs };
  }

  bucket.hits.push(now);
  memoryBuckets.set(key, bucket);

  // Opportunistic cleanup so a long-lived process does not leak unbounded keys.
  if (memoryBuckets.size > 10_000) {
    for (const [bucketKey, value] of memoryBuckets) {
      if (value.hits.every((timestamp) => timestamp <= cutoff)) {
        memoryBuckets.delete(bucketKey);
      }
    }
  }

  return {
    success: true,
    remaining: Math.max(0, max - bucket.hits.length),
    reset: now + windowMs,
  };
}

/**
 * Fixed-window limiter backed by PostgreSQL. Upstash is preferred when
 * configured; this path makes production limits shared across serverless
 * instances instead of silently falling back to per-instance memory.
 *
 * The upsert is atomic and parameterised. The row is only reset when its
 * window has actually elapsed.
 */
async function databaseLimit(
  key: string,
  max: number,
  windowMs: number,
): Promise<RateLimitResult> {
  const resetAt = new Date(Date.now() + windowMs);
  const rows = await prisma.$queryRaw<Array<{ count: number; resetAt: Date }>>(Prisma.sql`
    INSERT INTO "RateLimitBucket" ("key", "count", "resetAt", "updatedAt")
    VALUES (${key}, 1, ${resetAt}, NOW())
    ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE
        WHEN "RateLimitBucket"."resetAt" <= NOW() THEN 1
        ELSE "RateLimitBucket"."count" + 1
      END,
      "resetAt" = CASE
        WHEN "RateLimitBucket"."resetAt" <= NOW() THEN EXCLUDED."resetAt"
        ELSE "RateLimitBucket"."resetAt"
      END,
      "updatedAt" = NOW()
    RETURNING "count", "resetAt"
  `);

  const row = rows[0];
  if (!row) throw new Error('Rate-limit upsert returned no row');

  // Keep the table from growing forever. Best-effort, never on the request path.
  if (Math.random() < 0.01) {
    const staleBefore = new Date(Date.now() - 7 * 24 * 60 * 60 * 1_000);
    void prisma.rateLimitBucket
      .deleteMany({ where: { resetAt: { lt: staleBefore } } })
      .catch(() => undefined);
  }

  return {
    success: row.count <= max,
    remaining: Math.max(0, max - row.count),
    reset: row.resetAt.getTime(),
  };
}

function logDatabaseFailure(error: unknown): void {
  if (databaseFailureLogged) return;
  databaseFailureLogged = true;
  console.error(
    '[rate-limit] database limiter failed; using per-instance memory fallback',
    error instanceof Error ? error.message : 'unknown',
  );
}

async function distributedLimit(
  key: string,
  max: number,
  windowMs: number,
): Promise<RateLimitResult> {
  if (isProduction) {
    try {
      return await databaseLimit(key, max, windowMs);
    } catch (error) {
      logDatabaseFailure(error);
    }
  }
  return memoryLimit(key, max, windowMs);
}

/**
 * Sliding-window limiter. Uses Upstash when configured. In production without
 * Upstash, a Postgres fixed-window bucket provides cross-instance enforcement;
 * local development keeps the in-process limiter.
 */
function createLimiter(tokens: number, windowSeconds: number, prefix: string): Limiter {
  const redis = getRedis();

  if (redis) {
    const ratelimit = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(
        tokens,
        `${windowSeconds} s` as Parameters<typeof Ratelimit.slidingWindow>[1],
      ),
      prefix: `voidterm:${prefix}`,
      analytics: false,
    });

    return {
      limit: async (key) => {
        try {
          const result = await ratelimit.limit(key);
          return { success: result.success, remaining: result.remaining, reset: result.reset };
        } catch (error) {
          console.error(
            '[rate-limit] upstash failure, falling back',
            error instanceof Error ? error.message : 'unknown',
          );
          return distributedLimit(`${prefix}:${key}`, tokens, windowSeconds * 1_000);
        }
      },
    };
  }

  return {
    limit: async (key) =>
      distributedLimit(`${prefix}:${key}`, tokens, windowSeconds * 1_000),
  };
}

/** 5 OTP requests per email address per hour. */
export const otpEmailLimiter = createLimiter(5, 60 * 60, 'otp:email');

/** 20 OTP requests per source IP per hour. */
export const otpIpLimiter = createLimiter(20, 60 * 60, 'otp:ip');

/** Block online guessing against verify-otp (the per-code attempt cap is the primary guard). */
export const otpVerifyLimiter = createLimiter(30, 60 * 60, 'otp:verify');

/** 100 chat turns per authenticated user per hour. There is no daily message cap. */
export const chatLimiter = createLimiter(100, 60 * 60, 'chat:user');

/**
 * Resolve the client IP behind Vercel / Cloudflare / generic proxies.
 * Values are only used for rate limiting and coarse audit data.
 */
export function getClientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0];
    if (first && first.trim()) return first.trim();
  }

  return (
    request.headers.get('x-real-ip') ??
    request.headers.get('cf-connecting-ip') ??
    '127.0.0.1'
  );
}
