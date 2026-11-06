import { NextResponse } from 'next/server';

/** Application-level cap for JSON endpoints. Vercel still enforces its own edge cap. */
const MAX_JSON_BODY_BYTES = 256 * 1024;

export function jsonError(
  status: number,
  error: string,
  message: string,
  extra?: Record<string, unknown>,
): NextResponse {
  return NextResponse.json({ error, message, ...extra }, { status });
}

export function unauthorized(): NextResponse {
  return jsonError(401, 'unauthorized', 'Authentication required.');
}

export function csrfRejected(): NextResponse {
  return jsonError(403, 'invalid_origin', 'Request origin is not allowed.');
}

/**
 * CSRF defence in depth for state-changing requests. SameSite=Lax cookies
 * already block most cross-site submissions; this additionally rejects
 * browser-identified cross-site requests and requires the Origin host to match
 * the request host when an Origin header is present.
 *
 * Requests without Origin (curl, server-to-server, some privacy browsers) are
 * still allowed because the session cookie is required and SameSite=Lax stops
 * it from riding a cross-site form post.
 */
export function isSameOrigin(request: Request): boolean {
  // Fetch Metadata is sent by modern browsers and cannot be spoofed by a
  // cross-site page. Reject cross-site requests even if Origin is absent.
  if (request.headers.get('sec-fetch-site')?.toLowerCase() === 'cross-site') {
    return false;
  }

  const origin = request.headers.get('origin');
  if (!origin) return true;

  let originHost: string;
  try {
    originHost = new URL(origin).host.toLowerCase();
  } catch {
    return false;
  }

  const forwardedHost = request.headers.get('x-forwarded-host');
  const host = (forwardedHost ?? request.headers.get('host') ?? '').split(',')[0]?.trim().toLowerCase();

  // An Origin without a host is not a normal HTTP request; fail closed.
  if (!host) return false;
  return originHost === host;
}

/**
 * Parse a JSON body defensively and bound its size. Invalid JSON, a non-JSON
 * content type, or an oversized body all return null so callers respond 400.
 */
export async function readJson(request: Request): Promise<unknown> {
  const declaredLength = Number(request.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_JSON_BODY_BYTES) {
    return null;
  }

  const contentType = request.headers.get('content-type')?.toLowerCase();
  if (contentType && !contentType.includes('application/json')) {
    return null;
  }

  try {
    const body = await request.text();
    if (new TextEncoder().encode(body).byteLength > MAX_JSON_BODY_BYTES) {
      return null;
    }
    return JSON.parse(body);
  } catch {
    return null;
  }
}

export function rateLimited(reset: number): NextResponse {
  const retryAfter = Math.max(1, Math.ceil((reset - Date.now()) / 1_000));
  return NextResponse.json(
    {
      error: 'rate_limited',
      message: 'Too many requests. Try again shortly.',
      retryAfter,
    },
    {
      status: 429,
      headers: {
        'Retry-After': String(retryAfter),
        'X-RateLimit-Remaining': '0',
      },
    },
  );
}
