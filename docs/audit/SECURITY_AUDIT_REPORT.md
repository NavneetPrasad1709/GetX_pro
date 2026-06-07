# GETX — Security Audit Report

> Build: Step 07/36. Verified from code. Bar: real-money platform.

## Score: 68 / 100 — strong auth foundation, missing perimeter hardening; money-path security N/A (not built).

## 1. What's done well (verified)
- **Authentication**: bcryptjs cost 12; **timing-safe login** (compares against a dummy hash when the email is unknown → blocks enumeration, `lib/auth.ts`); generic failure messages; JWT sessions with role refresh via `unstable_update`.
- **Email/verify/reset tokens**: stored **SHA-256 hashed**, single-use, TTL'd, reset tokens namespaced — a DB leak yields no usable links.
- **Authorization**: `requireUser()` / `requireRole()` / `assertOwner()` enforced server-side in layouts, pages and actions; ownership re-checked **inside the DB transaction** (`server/services/listings.ts`). Admin gated in `proxy.ts` + admin layout + page (defense in depth).
- **Bot protection**: Cloudflare Turnstile, **fails closed**; dev-bypass only outside production.
- **Rate limiting**: present on auth + authenticated writes; authed-write keys are **userId-only** (not attacker-controlled `X-Forwarded-For`) — a deliberate, correct choice.
- **Open redirect**: `safeCallbackUrl()` allows only same-origin relative paths.
- **Injection**: all DB access via Prisma (parameterized); no raw SQL; marketplace inputs parsed/clamped (`parseMarketplaceSearchParams`, never throws).
- **XSS**: user content rendered through React (auto-escaped); the only `dangerouslySetInnerHTML` is JSON-LD that is `JSON.stringify`'d with `<` escaped (`breadcrumbs.tsx`, listing `productJsonLd`).
- **CSRF**: Next.js Server Actions (encrypted action IDs, same-origin) + NextAuth built-in CSRF cover the mutation surface; the search form is a safe idempotent GET.

## 2. Findings

| Sev | Finding | Fix |
|---|---|---|
| 🔴 Critical | **No version control.** `D:\GetX` is not a git repo → no audit trail, no rollback, no CI gate, no protected secrets history. | `git init` + remote + verify `.env` is gitignored (it is referenced as gitignored, but confirm it was never committed once a repo exists). |
| 🟠 High | **No security headers / CSP.** `next.config.ts` is empty; no `headers()`, no `Content-Security-Policy`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`, HSTS. | Add a strict CSP + headers via `next.config.ts` (or `vercel.ts`). Clickjacking + XSS defense-in-depth before any public exposure. |
| 🟠 High | **Rate limiter is in-memory, per-instance** (`lib/rate-limit.ts`, documented). On Vercel's multi-instance serverless it resets per cold start and per region → brute-force/credential-stuffing bypass. | Move to Upstash/Redis (Step 32) — but **pull forward** for `/login`, register, reset, and (when built) payment/webhook endpoints. |
| 🟠 High | **No error monitoring.** Sentry is scheduled at Step 09 — a payment bug without monitoring is blind. | Keep the Step 09 promise; do not defer Sentry to launch. |
| 🟡 Med | **No account lockout / progressive backoff** beyond the fixed-window limiter; no breached-password check. | Add lockout after N failures + (optional) HaveIBeenPwned k-anonymity check at signup. |
| 🟡 Med | **No CAPTCHA/Turnstile on password-reset request** (enumeration via reset is mitigated by hashing, but the endpoint is unthrottled spam surface). | Verify Turnstile + rate-limit cover forgot-password (confirm in `actions/auth.ts`). |
| 🟡 Med | **Session strategy = JWT**; role changes refresh via `unstable_update`, but a compromised/long-lived JWT can't be force-revoked server-side. | Acceptable for MVP; plan a session-version claim or DB-session for high-value actions (payout) at Step 14. |
| 🟢 Low | OAuth uses `allowDangerousEmailAccountLinking` (mitigated by provider-verified-email check in `signIn`). | Already handled; keep the verified-email guard. |

## 3. Money-path security — **N/A (not implemented)**
Webhook signature verification, payment idempotency, escrow integrity, payout authorization, and
double-spend protection **cannot be audited because the code does not exist** (Steps 09–14). The
*schema design* is correct (idempotent `ProcessedWebhook`, append-only `LedgerEntry`, explicit
order/payment state machines). **Mandatory at build time:**
- Verify every webhook signature; dedupe by `(provider, providerEventId)` before any side effect.
- All money mutations server-side, inside one transaction; never trust client amounts.
- Re-derive balances from the ledger; never mutate `cachedBalanceMinor` as truth.
- Authorize payout against session + KYC status; idempotent payout requests.

## 4. File-upload security — **N/A until Step 12**
When R2 lands: private bucket for KYC/PII, short-lived signed URLs, direct browser→R2, strict
content-type + size limits, never trust client filename, consider AV scanning, and configure
`next/image` `remotePatterns` narrowly (only the R2 host).

## Security verdict
Foundation is **above-average for an MVP** (auth is genuinely well done). The launch blockers are
**perimeter** (headers/CSP, distributed rate-limit, git/CI, Sentry) and the **unbuilt money path**.
No critical vulnerability in *existing* code beyond the missing-git ops gap.
