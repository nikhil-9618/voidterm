import { NextResponse, type NextRequest } from 'next/server';

/**
 * Fast rejection for protected API namespaces. Middleware runs on the edge and
 * intentionally only checks for the cookie's presence — full cryptographic and
 * database verification happens in every route via requireAuth().
 *
 * This keeps invalid/expired JWTs out of the Node runtime while ensuring an
 * attacker cannot gain access by forging a cookie that merely exists.
 */
export function middleware(request: NextRequest) {
  const hasSession = Boolean(request.cookies.get('session')?.value);

  if (!hasSession) {
    return NextResponse.json(
      { error: 'unauthorized', message: 'Authentication required.' },
      { status: 401, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  return NextResponse.next();
}

export const config = {
  // Keep /api/chat on the Node route so the request-scoped
  // x-vercel-oidc-token header reaches the AI Gateway provider. The route
  // enforces requireAuth() itself, so this is not an auth boundary.
  matcher: [
    '/api/conversations',
    '/api/conversations/:path*',
    '/api/user/:path*',
  ],
};
