# VOIDTERM Security Audit & Implementation Report

**Date:** 2026-11-14 (second pass; original audit 2026-11-06)  
**Application:** VOIDTERM (`https://voidterm.vercel.app`)  
**Architecture:** Next.js 14 App Router, Node route handlers, Prisma + PostgreSQL (Neon), passwordless email OTP (Resend), Vercel hosting.

## 1. Executive summary

The application already had a sound authentication baseline: database-backed sessions, signed/JWT cookies, HttpOnly/Secure/SameSite cookies, bcrypt-hashed one-time codes, ownership-scoped Prisma queries, origin checks, and rate-limit hooks. This pass added the missing defense-in-depth controls and removed several unsafe defaults.

The highest-risk remaining item is the dependency baseline: Next.js 14.2.35 still has published advisories that are only fixed in Next.js 16.4.5 (a breaking major upgrade). This is documented below rather than hidden. No passwords, MFA enrollment system, or administrative role system existed in the original architecture; those are called out explicitly and were not replaced with decorative controls.

## 2. Findings and disposition

| # | Severity | Finding | Disposition |
|---|---|---|---|
| 1 | Critical | Next.js 14.2.33 had multiple server-component/DoS/RSC/image-optimizer/request-smuggling advisories. | Upgraded to **14.2.35** and disabled the unused `next/image` optimizer. **Residual:** advisories requiring Next.js 16.4.5 remain. |
| 2 | High | `@vercel/oidc` dependency chain pulled a vulnerable `zod` in a supporting package. | Upgraded `@vercel/oidc` to **4.0.7**. |
| 3 | High | Production had no Upstash credentials, so the rate limiter silently used per-instance memory on Vercel. This made OTP/chat limits bypassable by hitting different instances. | Added a **Postgres-backed fixed-window production fallback**; Upstash remains the preferred path. |
| 4 | High | Missing CSP, HSTS, frame protection, COOP/CORP, and Permissions-Policy. | Added a global security-header policy in `next.config.js`. |
| 5 | High | Upload validation trusted the client MIME type and extension; `image/*` and `text/*` allowed SVG/HTML uploads. | Added magic-byte validation, strict allowlist, canonical MIME types, and server-generated filenames. SVG/HTML/executables are rejected. |
| 6 | Medium | JSON endpoints had no application-level request-size limit. | Added a 256 KiB `readJson` cap (declared and actual byte length) plus JSON content-type enforcement. |
| 7 | Medium | CSRF origin checks allowed requests with no `Origin`; same-site cookie was the only second layer. | Added Fetch Metadata (`Sec-Fetch-Site: cross-site`) rejection and kept strict origin-host comparison. |
| 8 | Medium | Markdown link rendering relied only on the library default URL policy. | Added an explicit allowlist (`http`, `https`, `mailto`) and `nofollow ugc`/`noopener noreferrer`; images use `no-referrer`. |
| 9 | Medium | No audit coverage for uploads or conversation deletion. | Added audit events for both. Existing OTP/login/session/policy events remain. |
| 10 | Medium | No dependency-update automation. | Added weekly Dependabot configuration. |
| 11 | Medium | `DIRECT_URL` was required by Prisma but missing from `.env.example`. | Documented it. |
| 12 | Informational | Passwordless architecture has no password hashing/reset/MFA flows. | OTP codes are bcrypt cost 10; email verification is the login mechanism. Password reset is not applicable. **Second pass:** optional TOTP MFA implemented. |
| 13 | High | Production attachment uploads returned 501 because no Supabase storage was configured, and the old public-bucket design would have exposed files. | **Fixed:** private Postgres-backed storage with authenticated, ownership-scoped downloads. |
| 14 | Medium | Uploaded attachments were persisted but never included in the model prompt, so the feature had no effect on answers. | **Fixed:** UTF-8 text/source/JSON attachment contents are bounded and fenced as untrusted data in the prompt. |
| 15 | High | A stolen mailbox (the only factor) yielded a full session. | **Fixed:** opt-in TOTP MFA with encrypted secrets and single-use bcrypt recovery codes. |
| 16 | Medium | The explicitly documented context panel was implemented but never mounted, and `⌘⇧B` did nothing. | **Fixed:** panel mounted with a topbar toggle and the documented shortcut. |

## 3. Controls verified in the original code

- **Sessions:** random server-side session token, SHA-256 token hash stored in Postgres, signed HS256 JWT with issuer/audience/expiry, 30-day expiry, DB row checked on every authenticated request, revoke and revoke-all endpoints, HttpOnly + Secure + SameSite=Lax cookie.
- **OTP:** 6-digit code generated with `crypto.randomInt`, bcrypt-hashed, 10-minute TTL, single-use transaction, five-attempt cap, email/IP/verify rate limits, generic responses that do not reveal account existence.
- **Authorization:** every conversation/message/export query includes `userId`; message pagination first verifies conversation ownership. No IDOR path was found in the reviewed routes.
- **CSRF:** mutation routes check Origin host; SameSite=Lax cookie; now also Fetch Metadata.
- **SQL injection:** Prisma parameterised queries throughout; the new rate-limit raw query uses `Prisma.sql` parameters.
- **XSS:** React escapes Markdown text; no user-controlled `dangerouslySetInnerHTML`; links now apply an explicit protocol allowlist; CSP is enabled.
- **SSRF/command injection/path traversal:** no user-controlled server-side URL fetch, `child_process`, `eval`, or filesystem path built from a raw upload name. Export filenames are slugged; upload keys are user-scoped UUIDs plus a sanitised name.
- **Secrets:** `.env` is ignored; `.env.example` contains placeholders only; no secret is returned by an API.

## 4. Implemented controls

### HTTP and browser security
`next.config.js` now sets:

- `Content-Security-Policy` with `default-src 'self'`, frame denial, object denial, form-action self, base-uri self, restricted image/font/style sources, and production `upgrade-insecure-requests`.
- `Strict-Transport-Security` in production (`max-age=63072000; includeSubDomains`).
- `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy`, `Cross-Origin-Opener-Policy`, `Cross-Origin-Resource-Policy`, `Origin-Agent-Cluster`, `X-Permitted-Cross-Domain-Policies`, and `X-DNS-Prefetch-Control`.
- `images.unoptimized: true` because the app has no `next/image` usage. This removes an unused image-processing attack surface.

CSP uses `'unsafe-inline'` for scripts because Next.js 14 injects inline bootstrap scripts and this release has a known CSP-nonce advisory. A nonce-based CSP should be implemented together with the Next.js major upgrade, not before it.

### Request and CSRF hardening
`src/lib/http.ts`:

- Rejects a 256 KiB+ JSON body by declared `Content-Length` and by actual UTF-8 byte length.
- Rejects a non-JSON content type.
- Rejects browser requests with `Sec-Fetch-Site: cross-site`.
- Keeps origin-host verification for mutations.
- Fails closed when an Origin is present but the request host cannot be determined.

### Upload hardening
`src/lib/upload-security.ts` and `src/app/api/attachments/upload/route.ts`:

- Magic-byte checks for PNG, JPEG, GIF, WebP, and PDF.
- UTF-8 validation for source/text files; invalid JSON is rejected.
- Explicitly blocks SVG, HTML, XML, executables, and unsupported extensions.
- Stores text/source as `text/plain` and images/PDF as canonical MIME types.
- Uses a sanitised base name plus canonical extension and a UUID; no client path is used.
- Enforces 10 MiB file and multipart limits before parsing the body when a content length is present.
- Adds `attachment.uploaded` audit events.

**Superseded in the second pass:** the public Supabase-bucket design was removed. See §12 for private Postgres storage, authenticated downloads, quotas, and active-content PDF rejection. Malware scanning remains a residual risk (heuristics only).

### Distributed rate limiting
`src/lib/rate-limit.ts` + `RateLimitBucket` migration:

- Upstash sliding window when Redis is configured.
- In production without Upstash, an atomic Postgres upsert provides a shared fixed window across serverless instances.
- If the database limiter fails, the request falls back to per-instance memory and logs once; the application remains available but the distributed guarantee is lost.
- Stale buckets are cleaned up opportunistically.

### Markdown and audit
- Markdown URLs are limited to `http`, `https`, and `mailto`; `data:`, `file:`, `javascript:`, and custom protocols are dropped.
- External links use `noopener noreferrer nofollow ugc`; images use `referrerPolicy="no-referrer"`.
- Conversation deletion and attachment upload are now recorded in the append-only audit table.

## 5. Files created/modified

**Created**

- `SECURITY_AUDIT.md`
- `src/lib/upload-security.ts`
- `prisma/migrations/20261106190000_add_rate_limit_buckets/migration.sql`
- `scripts/security-smoke.mjs`
- `.github/dependabot.yml`

**Modified**

- `next.config.js`
- `src/lib/http.ts`
- `src/lib/rate-limit.ts`
- `src/app/api/attachments/upload/route.ts`
- `src/app/api/conversations/[id]/route.ts`
- `src/components/chat/markdown-renderer.tsx`
- `prisma/schema.prisma`
- `.env.example`
- `package.json`, `package-lock.json` (Next.js 14.2.35, `@vercel/oidc` 4.0.7, matching `eslint-config-next`)

## 6. Environment variables

No new required secret was introduced. Existing variables remain:

`DATABASE_URL`, `DIRECT_URL`, `JWT_SECRET`, `NEXT_PUBLIC_APP_URL`, `RESEND_API_KEY`, `EMAIL_FROM`, AI provider keys, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`.

The second pass introduced **no new required variable**. TOTP secrets are encrypted with a key derived from `JWT_SECRET`; rotating it signs sessions out, and recovery codes still allow MFA users back in. `SUPABASE_*` variables are no longer read.

`DIRECT_URL` is now documented in `.env.example`. `JWT_SECRET` must be at least 32 characters. In production, `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` are recommended; without them the Postgres fallback is used.

## 7. Database changes

Migration `20261106190000_add_rate_limit_buckets` creates:

```sql
CREATE TABLE "RateLimitBucket" (
  "key" TEXT PRIMARY KEY,
  "count" INTEGER NOT NULL DEFAULT 0,
  "resetAt" TIMESTAMP(3) NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "RateLimitBucket_resetAt_idx" ON "RateLimitBucket"("resetAt");
```

The Vercel build command runs `prisma migrate deploy` before `next build`, so this migration applies during deployment. No existing table or user data is altered.

## 8. Security testing results

### Local checks (production-mode server on port 3100)

`node scripts/security-smoke.mjs http://127.0.0.1:3100` — **15/15 passed**:

- Home returns 200; CSP, frame-ancestors, X-Frame-Options, nosniff, referrer policy, Permissions-Policy, HSTS, and no wildcard CORS.
- Anonymous `POST /api/chat`, `GET /api/conversations`, and `POST /api/attachments/upload` return 401.
- Foreign-Origin OTP request returns 403.
- Cross-site Fetch Metadata OTP request returns 403.
- Invalid JSON returns 400 before email/DB work.
- 300 KiB JSON body returns 400.

### Upload validator checks

Nine focused cases passed:

- Valid PNG accepted as `image/png`.
- HTML renamed to `.png` rejected.
- SVG rejected.
- Source file accepted as `text/plain` with traversal removed.
- Valid JSON accepted as `application/json`.
- Invalid JSON rejected.
- PDF accepted.
- Executable rejected.
- `../../../etc/passwd.txt` normalised to `passwd.txt`.

### Build/type checks

- `npx tsc --noEmit` passes.
- `npm run build` passes on Next.js 14.2.35.
- `prisma validate` passes when `DIRECT_URL` is present; local `.env` was missing it, so `.env.example` now documents it.

### Production verification

Deployment `dpl_A4wbDfhCbo4jbuo6j1ZWHtuX6F8u` is **READY/PROMOTED** at `https://voidterm.vercel.app`. The build log confirms migration `20261106190000_add_rate_limit_buckets` was applied successfully.

`node scripts/security-smoke.mjs https://voidterm.vercel.app` — **16/16 passed** (the extra check is production HSTS). Live headers include CSP, HSTS (`max-age=63072000; includeSubDomains`), `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, and no wildcard CORS.

The login page returned 200 in the cloud browser; all scripts/fonts loaded with 200 responses, the email input rendered, and the console recorded **no CSP violations or JavaScript errors**.

### Dependency audit

`npm audit --omit=dev` reports **11 vulnerabilities: 4 low, 3 moderate, 3 high, 1 critical**. The remaining critical/high items are in the Next.js 14 tree and the PostCSS/Prism/zod transitive paths. The audit tool recommends Next.js 16.4.5, which is a breaking major upgrade. `@vercel/oidc` was upgraded and removed from the previously reported chain.

### Not tested (requires accounts/credentials or destructive state)

- Signed-in cross-account IDOR/authorization tests.
- Full OTP send → verify → session lifecycle against production.
- End-to-end attachment upload and retrieval.
- Production rate-limit behavior across multiple serverless instances.
- Dependency exploit reproduction or load testing.

## 9. Remaining risks and recommendations

1. **Upgrade Next.js to 16.4.5+** (with React 19/async `cookies()` migration) to close the remaining critical/high advisories. This is the top priority.
2. **Use Upstash in production** for globally accurate sliding windows. The Postgres fallback is shared but fixed-window and adds a write per limited request.
3. **Add malware scanning** to attachments. Storage is now private and download is authorized; the PDF active-content check is a heuristic, not an antivirus engine.
4. **Move CSP to a nonce-based policy** after the Next major upgrade; the current policy still allows inline scripts.
5. **Add TOTP MFA** only if the product needs a second factor beyond email possession. Password reset and password hashing are not applicable to the passwordless design.
6. **Add alerting** for repeated OTP failures, rate-limit spikes, and new admin/privileged events. The audit table exists but there is no alert transport.
7. **Server-side authorization tests** with two real accounts should run in CI before release.
8. **Database least privilege and backups:** use a Neon role scoped to the application schema, verify TLS, enable PITR/retention, and test restore. These are provider controls, not application code.
9. **WAF/DDoS:** Vercel supplies platform DDoS protection; add project firewall rules for abusive paths if needed. No custom WAF rules were configured in this pass.
10. **Do not add a security dashboard** that is not backed by real alerting/actioning.

## 10. Production deployment checklist

- [x] Confirm `DIRECT_URL` is set to the direct (non-pooled) Neon URL.
- [x] Confirm `JWT_SECRET` is configured; use at least 32 random characters and rotate any key that may have been shared.
- [ ] Set `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` (recommended).
- [x] Deploy and verify the `RateLimitBucket` migration completed.
- [x] Verify `Strict-Transport-Security`, CSP, `X-Frame-Options: DENY`, and `X-Content-Type-Options` on the production origin.
- [x] Run `node scripts/security-smoke.mjs https://voidterm.vercel.app`.
- [x] Load the login page in a browser and check the console for CSP violations.
- [ ] Test OTP send/verify with a real inbox and confirm the session cookie.
- [ ] Test cross-account conversation access with two accounts.
- [ ] Test upload rejection and an authorized upload; confirm object URLs are not publicly enumerable.
- [ ] Configure a private storage bucket + signed URLs and malware scanning.
- [ ] Schedule the Next.js major upgrade and Dependabot review.
- [ ] Verify Neon backups/PITR and perform a restore drill.

## 11. Notes on the requested checklist items

- **Argon2id/bcrypt password hashing:** no passwords exist. OTP codes are bcrypt cost 10.
- **Email verification:** the OTP login verifies mailbox possession.
- **Password reset:** not applicable; requesting a new OTP is the recovery path.
- **MFA:** not implemented. Email OTP is the only factor.
- **RBAC:** object ownership and tier checks exist; there is no administrative role surface.
- **Malware scanning:** not implemented.
- **WAF/DDoS:** platform-level only; no custom rules.
- **Security dashboard:** intentionally not added; audit logs are persisted and queryable in the database.

## 12. Second pass (2026-11-14): functional repair and new controls

### 12.1 Defects fixed

- **Context panel was dead code.** `ContextPanel` was fully implemented but never mounted, so the model matrix, token/cost telemetry, system-prompt editor, fallback chain, and scanline toggle were unreachable. It is now mounted with a topbar toggle and the documented `⌘⇧B` shortcut.
- **Production uploads were broken.** No object storage was configured on Vercel, so `POST /api/attachments/upload` returned `501`. Storage was also designed around a public Supabase bucket. Replaced with private, database-backed storage.
- **Attachments never reached the model.** Bytes were validated and persisted, but only `fileUrl` metadata was stored; the model prompt contained no file content. Text attachments are now decoded, bounded, and included as untrusted reference data.
- **OTP delivery limitation made explicit.** `EMAIL_FROM` is `VOIDTERM <onboarding@resend.dev>`. Resend's sandbox sender only delivers to the Resend account owner, so sign-in for other addresses cannot work until a sending domain is verified. The application now logs a prominent production warning; fixing it requires a DNS/Resend configuration change, not code.

### 12.2 Private attachment storage

- New `AttachmentBlob` table stores `userId`, canonical filename/MIME, size, SHA-256, and `BYTEA` content. `Attachment.fileName` preserves the display name.
- Maximum file size is **4 MiB** (below Vercel's 4.5 MB function body limit); per-user storage quota is **50 MiB**; uploads are limited to **10 per user per hour**.
- Magic-byte validation remains: PNG, JPEG, GIF, WebP, passive PDF, and UTF-8 text/source/JSON. HTML/SVG/executables are rejected. PDFs containing `/JavaScript`, `/JS`, `/Launch`, `/EmbeddedFile`, `/OpenAction`, or `/AA` are rejected.
- `GET /api/attachments/[id]` requires a valid session, scopes the lookup by `userId`, returns `404` for another account's file, and sends `Content-Disposition: attachment`, `X-Content-Type-Options: nosniff`, `Content-Security-Policy: default-src 'none'; sandbox`, and `Cache-Control: private, no-store`. Downloads are audited.
- No public object URL exists. Arbitrary external attachment URLs are accepted as links but are never fetched server-side, so the upload/chat path adds no SSRF surface.
- **Prompt-injection defence:** text contents are capped (12k chars/file, 24k chars/request), stripped of control characters, wrapped in `<attachment>` elements, and the system prompt explicitly marks them as untrusted data that must not be followed as instructions. Raw file bytes are not duplicated into the stored message text.

### 12.3 TOTP MFA

- Opt-in per account; existing users are unaffected until they enrol.
- 160-bit base32 secrets, RFC 6238 SHA-1/6-digit/30-second, ±1 step for clock drift.
- Secrets are encrypted at rest with AES-256-GCM under an HKDF-derived key from `JWT_SECRET`. Recovery codes are independently bcrypt-hashed, single-use, and survive a JWT key rotation.
- After a correct email code, `verify-otp` returns a five-minute signed `voidterm:mfa` challenge and **no session cookie**. `/api/auth/mfa/verify` consumes the challenge plus TOTP or recovery code before creating the session.
- MFA verification is limited per IP and per account (10 attempts / 15 minutes each). A used recovery code is removed atomically with `array_remove`, so concurrent replays cannot both succeed.
- Audited events: `auth.mfa_setup_started`, `auth.mfa_enabled`, `auth.mfa_challenge`, `auth.mfa_failed`, `auth.mfa_disable_failed`, `auth.mfa_disabled`, and `auth.login` with method `email_otp+totp` or `email_otp+recovery_code`.

### 12.4 Other hardening

- Conversation creation is limited to 60/user/hour, closing an authenticated row-spam path.
- `SUPABASE_*` configuration was removed from the environment schema and example file; there is no longer a public-bucket mode.
- Upload/attachment UI copy and limits now match the server (4 MB).

### 12.5 Verification performed

- `npx tsc --noEmit` passes.
- `npm run build` passes on Next.js 14.2.35; all new routes are present in the route manifest.
- All three migrations (`init`, `RateLimitBucket`, and `20261114230000_add_private_attachments_and_mfa`) applied cleanly to a fresh PostgreSQL 18 cluster.
- **48/48 end-to-end checks passed** against a real local Next.js server, PostgreSQL, and a mock Ollama provider:
  - OTP login, session cookie, `/api/auth/me`.
  - Text upload, private URL, owner download, anonymous `401`, cross-account `404`, download headers.
  - HTML-as-PNG `415`, active-content PDF `415`, 5 MB upload `413`.
  - Chat streams, attachment text appears inside `<attachment>` in the captured model request, filename persists, raw bytes are not duplicated into message text.
  - MFA setup, TOTP enable, 8 recovery codes, challenge-only email step, no pre-MFA cookie, wrong-code `400`, valid TOTP session, recovery-code session, single-use consumption, replay `400`, disable with TOTP.
  - Foreign Origin `403`, cross-site Fetch Metadata `403`, non-JSON `400`, 300 KiB JSON `400`.
- Production deployment and smoke tests are recorded in §13 after this change is shipped.

### 12.6 Files added/changed in the second pass

**Added**

- `prisma/migrations/20261114230000_add_private_attachments_and_mfa/migration.sql`
- `src/lib/attachments.ts`
- `src/lib/mfa.ts`
- `src/app/api/attachments/[id]/route.ts`
- `src/app/api/auth/mfa/{setup,enable,disable,status,verify}/route.ts`

**Changed**

- `prisma/schema.prisma`, `src/lib/upload-security.ts`, `src/lib/rate-limit.ts`, `src/lib/dto.ts`, `src/lib/auth.ts`, `src/lib/env.ts`
- `src/app/api/attachments/upload/route.ts`, `src/app/api/chat/route.ts`, `src/app/api/conversations/route.ts`, `src/app/api/auth/verify-otp/route.ts`, `src/app/api/auth/me/route.ts`
- `src/lib/ai/safety-prompts.ts`
- `src/app/verify/verify-form.tsx`, `src/components/chat/chat-input.tsx`, `src/components/chat/chat-view.tsx`, `src/components/chat/message-block.tsx`, `src/components/app-shell.tsx`, `src/components/sessions-dialog.tsx`, `src/components/sidebar.tsx`, `src/components/command-palette.tsx`
- `README.md`, `.env.example`, `SECURITY_AUDIT.md`

### 12.7 Remaining after the second pass

1. **Verify a Resend sending domain** and set `EMAIL_FROM` to it; otherwise only the Resend account owner can sign in.
2. **Upgrade Next.js to 16.4.5+** to close the remaining critical/high dependency advisories.
3. **Add malware scanning** (the PDF check is heuristic).
4. **Configure Upstash** for globally accurate sliding windows; the Postgres limiter is shared but fixed-window.
5. **Move CSP to nonces** after the Next major upgrade.
6. **Binary attachment understanding:** images/PDFs are stored privately but not sent to text-only models. Add vision or PDF text extraction deliberately, with size/cost bounds.
7. **Database operations:** monitor the 50 MB/user attachment quota, verify Neon PITR/backups, and test a restore.
