#!/usr/bin/env node
/**
 * Non-destructive security smoke checks. Usage:
 *   node scripts/security-smoke.mjs http://127.0.0.1:3000
 *   node scripts/security-smoke.mjs https://voidterm.vercel.app
 *
 * It never signs in, sends email, uploads a file, or mutates data.
 */
const base = (process.argv[2] ?? 'http://127.0.0.1:3000').replace(/\/$/, '');
const checks = [];

function record(name, passed, detail) {
  checks.push({ name, passed, detail });
}

async function request(pathname, init) {
  return fetch(`${base}${pathname}`, { redirect: 'manual', ...init });
}

const home = await request('/');
const headers = home.headers;
record('home returns 200', home.status === 200, `status ${home.status}`);
record('CSP present', Boolean(headers.get('content-security-policy')), 'content-security-policy');
record(
  'CSP frame-ancestors none',
  (headers.get('content-security-policy') ?? '').includes("frame-ancestors 'none'"),
  'CSP directive',
);
record('X-Frame-Options DENY', headers.get('x-frame-options') === 'DENY', headers.get('x-frame-options') ?? 'missing');
record('nosniff present', headers.get('x-content-type-options') === 'nosniff', headers.get('x-content-type-options') ?? 'missing');
record(
  'referrer policy present',
  headers.get('referrer-policy') === 'strict-origin-when-cross-origin',
  headers.get('referrer-policy') ?? 'missing',
);
record('permissions policy present', Boolean(headers.get('permissions-policy')), 'permissions-policy');
if (base.startsWith('https://')) {
  record('HSTS present', Boolean(headers.get('strict-transport-security')), 'strict-transport-security');
}
record('no wildcard CORS', headers.get('access-control-allow-origin') !== '*', 'access-control-allow-origin');

for (const [pathname, method = 'GET'] of [
  ['/api/chat', 'POST'],
  ['/api/conversations', 'GET'],
  ['/api/attachments/upload', 'POST'],
]) {
  const response = await request(pathname, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: method === 'POST' ? '{}' : undefined,
  });
  record(`${method} ${pathname} rejects anonymous`, response.status === 401, `status ${response.status}`);
}

const csrf = await request('/api/auth/send-otp', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Origin: 'https://evil.example',
  },
  body: JSON.stringify({ email: 'security-smoke@example.invalid' }),
});
record('cross-site OTP request rejected', csrf.status === 403, `status ${csrf.status}`);

const invalidJson = await request('/api/auth/send-otp', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: '{',
});
record('invalid JSON rejected before email', invalidJson.status === 400, `status ${invalidJson.status}`);

const fetchMetadata = await request('/api/auth/send-otp', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Sec-Fetch-Site': 'cross-site',
  },
  body: JSON.stringify({ email: 'security-smoke@example.invalid' }),
});
record('cross-site fetch metadata rejected', fetchMetadata.status === 403, `status ${fetchMetadata.status}`);

const oversized = await request('/api/auth/send-otp', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: `${'a'.repeat(300_000)}@example.invalid` }),
});
record('oversized JSON rejected', oversized.status === 400, `status ${oversized.status}`);

for (const check of checks) {
  console.log(`${check.passed ? 'PASS' : 'FAIL'}  ${check.name} (${check.detail})`);
}

const failed = checks.filter((check) => !check.passed);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed against ${base}`);
process.exit(failed.length === 0 ? 0 : 1);
