# STEP 32 — Security Hardening + WAF

> Goal: Pre-launch security pass — replace in-memory rate limiting with Upstash Redis sliding window,
> enforce a full CSP nonce, add session revocation, harden webhook routes with IP allowlisting,
> configure Cloudflare WAF rules, and close every remaining security gap before go-live.

---

## PROMPT (copy from here ⬇️)

You are the CTO + Senior Security Engineer + Senior Backend Engineer of GETX. Read `CLAUDE.md` +
`docs/ENGINEERING-GUARDRAILS.md` (§1, §4, §5, §7, §8) and `docs/DECISIONS.md`. Work in `D:\GetX`.
This is **Step 32 — Security Hardening + WAF**. Talk Hinglish. Follow the full workflow.

### Task

1. **Upstash Redis rate limiting** (`src/lib/rate-limit.ts`):

   - Install packages:
     ```
     npm install @upstash/redis @upstash/ratelimit
     ```
   - Add two new env vars to `.env.example` (keys only, no values):
     ```
     UPSTASH_REDIS_REST_URL=
     UPSTASH_REDIS_REST_TOKEN=
     ```
   - Rewrite `src/lib/rate-limit.ts` using `@upstash/ratelimit` with a **sliding window** algorithm.
     Keep the **exact same exported API surface** that all existing callers use (e.g.
     `rateLimit(identifier: string, options?: RateLimitOptions): Promise<{ success: boolean; remaining: number; reset: number }>`).
     This means zero changes are needed in any caller (auth routes, payment routes, server actions).
   - **Graceful degradation**: if `UPSTASH_REDIS_REST_URL` or `UPSTASH_REDIS_REST_TOKEN` is absent,
     fall back to the existing in-memory implementation (or a simple no-op that always returns
     `{ success: true, remaining: 999, reset: 0 }`) and log a `console.warn` once at module load.
     The app must never crash due to missing Upstash credentials.
   - Use one `Redis` client instance (module-level singleton) so connections are reused across
     requests in the serverless environment.
   - Rate limit buckets to configure (match or improve current limits):
     - Auth endpoints (`/api/auth/*`, login server action): 10 requests / 60 s per IP
     - Payment/webhook endpoints: 30 requests / 60 s per IP
     - General write actions (listings, messages, offers): 60 requests / 60 s per userId

2. **Full CSP nonce** (`src/proxy.ts` + `next.config.ts`):

   - **Current state**: Step 07/08 added partial `Content-Security-Policy` headers via
     `next.config.ts`. The existing policy may include `'unsafe-inline'` for scripts — remove it.
   - In `src/proxy.ts` (the Next.js Edge Middleware), generate a per-request cryptographic nonce:
     ```ts
     const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
     ```
     Set it on the request as a custom header `x-nonce` so server components can read it via
     `headers()`. Also forward it in the response headers.
   - Build the CSP string inside the middleware with:
     - `script-src 'self' 'nonce-${nonce}'` — NO `'unsafe-inline'`
     - `style-src 'self' 'nonce-${nonce}' 'unsafe-inline'` — `unsafe-inline` is acceptable for
       styles (no XSS risk from styles); keep it to avoid breaking shadcn/Tailwind inline styles
     - `connect-src 'self' <SOCKET_SERVER_ORIGIN>` — wire in the Railway Socket.io server origin
       here; read it from `process.env.NEXT_PUBLIC_SOCKET_URL` (already set from Step 11); strip
       any trailing path so only the origin is allowlisted. This closes the **Step 11 TODO** that
       was left in the CSP `connect-src`.
     - `img-src 'self' data: blob: *.r2.dev *.cloudflare.com` — allow R2 image domains
     - `font-src 'self' fonts.gstatic.com`
     - `frame-ancestors 'none'`
     - `base-uri 'self'`
     - `form-action 'self'`
     - `object-src 'none'`
   - Set the composed CSP as a response header `Content-Security-Policy` in the middleware (this
     replaces / supersedes any static CSP set in `next.config.ts`). Remove or stub out the old
     static CSP header from `next.config.ts` to avoid conflicts.
   - In server components / layouts that render `<script>` tags (e.g. Sentry init inline script,
     any analytics), read the nonce via `const nonce = (await headers()).get('x-nonce') ?? ''`
     and pass it as the `nonce` attribute. Audit `src/app/layout.tsx` and any files that include
     inline `<script>` blocks.
   - Verify: load the app in a browser, open DevTools → Network → any page response headers → the
     `Content-Security-Policy` header must contain `nonce-<value>` and must NOT contain `unsafe-inline`
     in `script-src`.

3. **Session revocation via `sessionVersion`** (fixes the Step 15 JWT-persistence caveat):

   - **Database migration** — add a new field to the `User` model in `prisma/schema.prisma`:
     ```prisma
     sessionVersion  Int  @default(0)
     ```
     Generate the migration using the repo's interactive-safe workflow:
     ```
     npx prisma migrate diff --from-schema-datasource --to-schema-datamodel prisma/schema.prisma --script
     ```
     Paste the output into a new hand-written migration folder
     `prisma/migrations/20260608130000_step32_session_version/migration.sql` then run:
     ```
     npx prisma migrate deploy
     ```
     Do NOT run `prisma migrate dev` (it is interactive and will hang).
   - **Auth.js JWT callback** (`src/lib/auth.ts` or wherever the `jwt` callback is defined):
     - On `trigger === 'signIn'` (or whenever a new token is issued), embed `sessionVersion` from
       the DB into the JWT token:
       ```ts
       const user = await db.user.findUnique({ where: { id: token.sub }, select: { sessionVersion: true } });
       token.sessionVersion = user?.sessionVersion ?? 0;
       ```
     - On every subsequent request (`trigger` is undefined / `update`), re-fetch the current
       `sessionVersion` from the DB and compare with `token.sessionVersion`. If they differ, return
       `null` from the `jwt` callback to force sign-out:
       ```ts
       const user = await db.user.findUnique({ where: { id: token.sub }, select: { sessionVersion: true } });
       if (user?.sessionVersion !== token.sessionVersion) return null;
       ```
     - Use the Prisma singleton from `src/lib/db.ts`. Cache the result for the duration of the
       request only (no cross-request caching — stale version = security hole).
   - **Increment `sessionVersion`** on every security-sensitive mutation:
     - `User` ban / suspend (admin panel, `src/server/actions/admin.ts` or `src/server/services/admin.ts`)
     - Password change (if implemented — skip gracefully if not yet built)
     - Admin role change (`src/server/actions/admin.ts`)
     - Add a helper `invalidateUserSessions(userId: string): Promise<void>` in `src/lib/auth-helpers.ts`
       (or alongside auth utils) that does:
       ```ts
       await db.user.update({ where: { id: userId }, data: { sessionVersion: { increment: 1 } } });
       ```
       Call this helper from all the above mutations (inside the existing transactions where possible).
   - **Edge case — DB lookup on every token refresh**: this adds one DB read per JWT refresh cycle.
     Since Auth.js v5 uses JWT strategy (not database sessions), the refresh happens at most once
     per `maxAge` / `updateAge` window (default 24 h). Accept this cost; it is the correct
     trade-off for immediate revocation. Add a brief comment in code explaining the trade-off.

4. **Webhook IP allowlist** (`src/config/webhooks.ts` + webhook route handlers):

   - Create `src/config/webhooks.ts` exporting two string arrays:
     ```ts
     export const RAZORPAY_WEBHOOK_IPS: string[] = [
       // https://razorpay.com/docs/webhooks/validate-test/#ip-addresses
       // Add the current Razorpay IP ranges here; update as they publish changes.
       '35.154.245.210', '43.205.58.103', // example IPs — replace with official list
     ];

     export const COINGATE_WEBHOOK_IPS: string[] = [
       // https://developer.coingate.com/reference/ip-addresses
       // Add the current CoinGate IP ranges here.
     ];
     ```
     Leave a comment above each array with a link to the official IP documentation page so the
     owner can keep them up to date. Also add a note: "Cloudflare proxy caveat — if Cloudflare
     proxying is active, `x-forwarded-for` reflects Cloudflare's edge IP, not the provider's
     origin IP. Either disable proxy (DNS-only) for the `/api/webhooks/*` subdomain/path or use
     Cloudflare Transform Rules to restore the original IP in a custom header."
   - Add an IP check helper in the same file:
     ```ts
     export function isAllowlistedIp(request: Request, allowlist: string[]): boolean {
       const xff = request.headers.get('x-forwarded-for') ?? '';
       const ip = xff.split(',')[0].trim();
       return allowlist.length === 0 || allowlist.includes(ip);
     }
     ```
     When `allowlist` is empty (i.e., not yet configured), the function returns `true` (open by
     default) and emits a `console.warn`. This prevents a misconfigured empty list from blocking
     all webhooks on day one.
   - In `src/app/api/webhooks/razorpay/route.ts`: at the TOP of the handler, before signature
     verification, call `isAllowlistedIp(request, RAZORPAY_WEBHOOK_IPS)`. If `false`:
     log the rejected IP via `console.error` + a Sentry warning breadcrumb, and return a `403`
     response. The existing HMAC signature check remains in place as a second defence layer.
   - Apply the same pattern to `src/app/api/webhooks/coingate/route.ts`.
   - Add `RAZORPAY_WEBHOOK_IPS` and `COINGATE_WEBHOOK_IPS` as optional `WEBHOOK_IP_ALLOWLIST_*`
     env vars (or document them in `src/config/webhooks.ts` as hardcoded, since IP ranges rarely
     change and env vars for lists are awkward to manage). Whichever approach is chosen, document
     it in `docs/DECISIONS.md`.

5. **Cloudflare WAF configuration** (instructions, not code — document in `docs/DECISIONS.md`):

   Write a clearly labelled section in `docs/DECISIONS.md` under **"Step 32 — Cloudflare WAF"**
   with exact, actionable steps the owner must perform in the Cloudflare dashboard:

   - **OWASP Managed Rules**: Cloudflare Dashboard → Security → WAF → Managed Rules → Deploy the
     "Cloudflare OWASP Core Ruleset". Set sensitivity to Medium for MVP; tune to High after
     monitoring false positives for 2 weeks.
   - **API rate limit rule**: WAF → Rate Limiting Rules → Create rule:
     - Expression: `http.request.uri.path matches "^/api/"` AND `not http.request.uri.path contains "/api/webhooks/"`
       (exclude webhook paths from rate limiting to avoid blocking providers)
     - Limit: 100 requests per minute per IP
     - Action: JS Challenge (not Block) — lets real users through if they have JS, blocks bots
     - Log action is also recommended for the first week before switching to Challenge
   - **Bot Fight Mode**: Security → Bots → Enable Bot Fight Mode. Note: may cause false positives
     on some legitimate automated clients (e.g., uptime monitors); add their IPs to the allowlist.
   - **Country blocking**: Security → WAF → Custom Rules. Leave this as the owner's decision;
     document the UI path. Suggested: initially log-only (Managed Challenge) for high-risk
     countries; Block only after reviewing actual traffic data.
   - **Webhook routes bypass**: ensure `/api/webhooks/*` is excluded from any WAF rule that could
     block or challenge provider IPs. CoinGate and Razorpay do not run browser JS; JS Challenge
     will break their webhooks.
   - **Zone**: confirm the `getx.live` zone is proxied (orange cloud) in Cloudflare DNS so WAF
     rules apply. The Railway Socket.io subdomain (e.g., `ws.getx.live`) should also be proxied
     with WebSocket support enabled under Network settings.

6. **Security headers audit** (`next.config.ts` / `src/proxy.ts`):

   - Review the headers set in Step 08's security audit. Verify the following are present and
     correctly valued (add any that are missing):
     - `X-Frame-Options: DENY`
     - `X-Content-Type-Options: nosniff`
     - `Referrer-Policy: strict-origin-when-cross-origin`
     - `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`
     - `Permissions-Policy: camera=(), microphone=(), geolocation=()` — add this header if missing.
       This is explicitly required by this step. Set it in the middleware response headers alongside
       the CSP.
   - After deploying, test on **https://securityheaders.com** — the target grade is **A**. Document
     the result in `docs/DECISIONS.md` (screenshot or copy the grade + summary).
   - If any header is being set in BOTH `next.config.ts` AND the middleware, remove the
     `next.config.ts` version to avoid duplicate/conflicting headers (middleware wins for dynamic
     routes; `next.config.ts` wins for static assets — be explicit about which path each header
     covers).

7. **`npm audit` — dependency vulnerability sweep**:

   - Run:
     ```
     npm audit --audit-level=high
     ```
   - For every `high` or `critical` severity finding:
     1. Run `npm audit fix` where the fix is non-breaking (patch / minor semver).
     2. For breaking-change fixes, manually review the changelog and upgrade if safe.
     3. If a vulnerability cannot be fixed (upstream not yet patched), document it in
        `docs/DECISIONS.md` under **"Step 32 — npm audit"** with: package name, CVE id (if any),
        severity, why it cannot be fixed now, and a planned review date (suggest 30 days).
   - The goal is **0 high or critical** unfixed vulnerabilities. Medium and low may remain if
     they are transitive dev dependencies with no realistic attack surface (document these too).
   - Re-run `npm audit --audit-level=high` after fixes and confirm the exit code is 0.
   - Run `npm run build` after any dependency changes to confirm nothing broke.

8. **QA harness** (`scripts/qa-step32.ts`):

   Follow the repo convention: `npx tsx scripts/qa-step32.ts`. Use `ok()` / `threw()` helpers.
   Clean up any test data in a `finally` block. The harness must run against the local dev DB and
   real (or mocked) services.

   Tests to include:

   - **Rate limit fires**: call the rate-limit function in a tight loop beyond the configured
     limit; assert that `success` flips to `false` within the expected window. If Upstash keys
     are absent (CI), assert that the in-memory fallback returns `success: true` (graceful
     degradation).
   - **Session revoked on ban**: create a test user, sign them in (mint a JWT via Auth.js `encode`
     helper), then call `invalidateUserSessions(userId)`, then simulate the `jwt` callback with the
     stale token — assert it returns `null` (i.e., the session is invalidated).
   - **CSP nonce in HTML**: `fetch('http://localhost:3000/')` and assert:
     1. The `Content-Security-Policy` response header is present.
     2. It contains `nonce-` followed by a base64 string.
     3. It does NOT contain `'unsafe-inline'` in the `script-src` directive.
   - **Webhook IP allowlist rejects unknown IP**: call the `isAllowlistedIp` helper with a
     non-allowlisted IP against a non-empty allowlist; assert it returns `false`. Call with an
     allowlisted IP; assert it returns `true`. Call with an empty allowlist; assert it returns
     `true` (open-by-default safety).
   - **`sessionVersion` DB migration**: assert that `db.user.findFirst()` returns a record with a
     `sessionVersion` field of type number (migration was applied).

9. **Edge cases**:

   - **Nonce on static assets**: `next.config.ts` headers (for static file routes) cannot use a
     per-request nonce. Set `Content-Security-Policy-Report-Only` on static routes if needed, or
     accept that static asset responses omit the nonce header (the middleware covers all page
     routes). Document this in comments.
   - **Upstash cold start**: the `@upstash/redis` client uses HTTP REST, not a persistent TCP
     connection, so there is no cold-start socket issue. Each call is an independent HTTPS fetch;
     the SDK handles retries internally.
   - **Rate limit identifier for unauthenticated users**: use the real IP (`x-forwarded-for`,
     first value). For authenticated users, prefer `userId` so VPN/proxy IP changes don't lock out
     a legitimate user mid-session. Ensure the identifier selection logic is consistent across all
     rate-limited endpoints.
   - **`sessionVersion` and social/OAuth login**: if a user logs in via OAuth (Google, etc.), the
     `jwt` callback still fires. The version check still applies. On an OAuth sign-in, embed the
     latest `sessionVersion` in the token just like credentials login.
   - **Razorpay/CoinGate IP list staleness**: the hardcoded IP list may go stale. Add a
     `console.warn` or Sentry alert when an IP near (but not on) the list makes a request with a
     valid signature — this suggests the provider rotated IPs. Document the monitoring approach.
   - **Permissions-Policy header and browser extensions**: some browser extensions may trigger
     Permissions-Policy violations. The header is advisory; these are not real errors. No action
     needed.
   - **`npm audit fix --force`**: never run `--force` without manually reviewing the changeset.
     Force upgrades can introduce breaking API changes in major-version bumps.

### Rules

- The exported API surface of `src/lib/rate-limit.ts` must remain unchanged. Zero diff in callers.
  Verify this by running `npm run typecheck` — any caller breakage surfaces immediately.
- Session revocation must be fail-closed: if the DB lookup in the `jwt` callback throws (e.g.,
  DB outage), catch the error, log to Sentry, and return `null` (deny access). Never default to
  granting access on DB error — that would defeat the revocation entirely.
- Webhook IP allowlist failures are logged + Sentry-alerted but never silently swallowed. The
  403 response must always include a log line with the rejected IP so the owner can diagnose
  provider IP rotation.
- Every env var added in this step must appear in `.env.example` with a comment explaining its
  purpose. Never hardcode credentials.

### Report back

CLAUDE.md output format + QA CHECKLIST below.

---

## ✅ QA CHECKLIST

- [ ] `npm install @upstash/redis @upstash/ratelimit` succeeds; no peer-dep conflicts
- [ ] `src/lib/rate-limit.ts` exports the same function signature as before — `npm run typecheck` shows 0 errors with no changes to callers
- [ ] Upstash rate limit fires after threshold when `UPSTASH_REDIS_REST_URL` + `TOKEN` are set
- [ ] In-memory fallback activates (with `console.warn`) when Upstash env vars are absent; app does not crash
- [ ] CSP `Content-Security-Policy` header is present on every page response (check via DevTools Network tab)
- [ ] CSP `script-src` contains `nonce-<value>` and does NOT contain `'unsafe-inline'`
- [ ] Socket.io Railway origin appears in CSP `connect-src` (Step 11 TODO closed)
- [ ] Inline `<script>` tags in `src/app/layout.tsx` carry the correct `nonce` attribute
- [ ] `prisma/migrations/20260608130000_step32_session_version/migration.sql` applies cleanly via `migrate deploy`
- [ ] `db.user.findFirst()` returns a record with a numeric `sessionVersion` field (default 0)
- [ ] Banning a user increments `sessionVersion`; their existing JWT is rejected on the next token refresh
- [ ] Admin role-change increments `sessionVersion` for the affected user
- [ ] `invalidateUserSessions` helper exists in `src/lib/auth-helpers.ts` (or equivalent) and is called from all relevant admin mutations
- [ ] `jwt` callback returns `null` (sign-out) when `token.sessionVersion` does not match DB value
- [ ] `jwt` callback returns `null` (not throws) when DB lookup fails — fail-closed behaviour confirmed
- [ ] `src/config/webhooks.ts` exports `RAZORPAY_WEBHOOK_IPS`, `COINGATE_WEBHOOK_IPS`, and `isAllowlistedIp`
- [ ] Razorpay webhook route returns 403 for a request with an unknown source IP
- [ ] CoinGate webhook route returns 403 for a request with an unknown source IP
- [ ] Requests with a valid allowlisted IP pass the IP check and reach signature verification
- [ ] `Permissions-Policy: camera=(), microphone=(), geolocation=()` header present in responses
- [ ] All existing Step 08 security headers (`X-Frame-Options`, `X-Content-Type-Options`, `HSTS`, `Referrer-Policy`) are still present and not duplicated
- [ ] `npm audit --audit-level=high` exits with code 0 (0 unfixed high/critical vulns); any remaining issues documented in `docs/DECISIONS.md`
- [ ] `scripts/qa-step32.ts` passes all 5 assertion groups (rate limit, session revocation, CSP nonce, IP allowlist logic, sessionVersion field)
- [ ] Cloudflare WAF instructions documented in `docs/DECISIONS.md` (OWASP rules, rate limit rule, Bot Fight Mode, webhook bypass note)
- [ ] `securityheaders.com` result grade **A** (or documented if not yet testable pre-deploy)
- [ ] `.env.example` updated with `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`
- [ ] `typecheck`/`lint`/`build` pass; all changed pages are mobile responsive; no `any` types introduced
- [ ] Step 32 ticked in `docs/ROADMAP.md`; all key decisions (Upstash, CSP nonce approach, sessionVersion trade-off, IP allowlist strategy) logged in `docs/DECISIONS.md`
- [ ] Final Status: ✅ Pass

---

## 👉 After this step

Move to **Step 33 — Performance** (bundle analysis, Lighthouse CI, Core Web Vitals budgets,
image optimisation, query profiling, and edge caching strategy before launch).

## 🔑 Tokens needed: **`UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`**
