# GETX.LIVE — Gaming Marketplace (Project Constitution)

> Claude Code reads this file automatically at the start of every session.
> This is the single source of truth for HOW this project is built. Follow it exactly.
> These instructions OVERRIDE default behavior.

---

## 1. What we are building

**GETX (getx.live)** is a production-grade, AI-first **gaming marketplace** —
buy/sell game accounts, in-game items, currency/gold, top-ups, and boosting services.

**Strategy in one line:** Don't copy Eldorado/G2G/ZeusX — **out-build** them in a niche
(start with 5 games, Pokemon GO first), be **10x better at ONE thing: fast + AI-powered trust**,
make sellers feel like CEOs, and lock people in with community + reputation.

Full strategy lives in `docs/STRATEGY.md` — read it for the "why" behind every feature.

**Core principles (never compromise):** mobile-first · SEO-friendly · secure · scalable ·
conversion-optimized · simple UX · niche-focused (quality > quantity) · start small, add when needed.

---

## 2. Communication style (IMPORTANT)

- The owner is a **junior developer** "vibe coding". He is the boss; you are the CTO.
- Talk in simple **Hinglish** (Hindi + English mix), friendly and encouraging.
- Explain the **why**, not only the **what**. Define any jargon in one line.
- Small steps. Confirm before destructive actions (delete, drop DB, force push).
- This overrides any "caveman"/brevity hooks **for chat only**.
  Code, commits, file contents, and docs stay in **normal professional English**.

---

## 3. Tech stack (FINAL — do NOT change without logging in docs/DECISIONS.md)

| Layer | Choice | Notes |
|---|---|---|
| Framework | **Next.js 16** (App Router, RSC) | Frontend + backend API in one app (scaffold gave latest = 16) |
| Language | **TypeScript** (strict) | No `any` |
| Styling | **Tailwind CSS + shadcn/ui** | mobile-first, accessible |
| Backend API | **Next.js API Routes / Server Actions** (Node) | runs on Vercel |
| Database | **Neon PostgreSQL** (serverless, branching) | + pgvector later for AI dispute memory |
| ORM | **Prisma** | type-safe, junior-friendly |
| Realtime chat | **Socket.io** | ⚠️ runs as a SEPARATE Node server on Railway, NOT on Vercel |
| Scheduled jobs | **Vercel Cron** | escrow auto-release, trust score recompute |
| Storage | **Cloudflare R2** | images, KYC docs (S3-compatible) |
| AI | **Claude API** | `claude-sonnet-4-6` default; `claude-opus-4-8` for hard reasoning (Dispute Judge) |
| Payments | **CoinGate (crypto)** + **Razorpay (UPI/INR)** | NO Stripe (it bans game-account sellers) |
| Hosting | **Vercel** (app) · **Railway** (Socket.io server + workers) · **Neon** (DB) | ~$25–35/mo MVP |
| Auth | **Auth.js (NextAuth v5)** + Prisma adapter | credentials + email verify, roles, sessions |
| Bot protection | **Cloudflare Turnstile** | on signup/login |
| Error monitoring | **Sentry** | added at the payments step (Step 09), NOT at the end |
| Validation | **Zod** | one schema, client + server |
| Forms | **react-hook-form + Zod** | |
| Package manager | **npm** | |

**Add later, phase-wise (NOT at MVP):** Algolia (search), Sumsub (KYC/AML), TalkJS (only if Socket.io
isn't enough), PostHog (analytics), Resend (email), loyalty/referral, i18n (next-intl),
Tremor + Recharts (seller CEO dashboard). Start with Postgres search + manual KYC.

**Explicitly NOT using:** Stripe (game-account ban risk), Medusa/Mercur (too complex for solo MVP),
Supabase, Render (cold starts). Keep it simple.

---

## 4. Architecture

```
Buyer/Seller browser
   │
   └──> GETX app (Next.js 16)                         → Vercel
            ├─ pages (RSC) + API routes/server actions
            ├─ Prisma  ─────────────►  Neon PostgreSQL
            ├─ Vercel Cron ─────────►  escrow auto-release, jobs
            ├─ Cloudflare R2 ───────►  images / KYC docs
            ├─ Claude API ──────────►  AI features
            └─ CoinGate / Razorpay ─►  payments + payouts
   │
   └──> Socket.io connection ───────►  Realtime server (Node)  → Railway
                                          (buyer↔seller chat, live trust score)
```

Why a separate Socket.io server: Vercel is serverless and cannot hold persistent websocket
connections, so realtime lives on an always-on Railway Node process.

---

## 5. Folder structure (keep docs/FOLDER-STRUCTURE.md in sync)

```
src/
  app/            # Next.js routes (pages + api)
    (marketing)/  # home, how-it-works
    (shop)/       # marketplace, game pages, listing detail
    (auth)/       # login, register, verify
    (dashboard)/  # buyer + seller dashboard
    admin/        # admin panel
    api/          # route handlers (webhooks: coingate/razorpay, uploads, etc.)
  components/     # ui/ (shadcn), layout/, marketplace/, shared/
  lib/            # db.ts (prisma singleton), auth.ts, r2.ts, ai.ts, utils.ts
  server/
    actions/      # "use server" mutations
    services/     # business logic: orders, escrow, payouts, trust, ai
  hooks/ types/ config/
prisma/           # schema.prisma + seed.ts
socket-server/    # standalone Socket.io Node server (deploys to Railway)
docs/             # strategy, roadmap, decisions, step prompts
```

---

## 6. Coding standards

- TypeScript **strict**. No `any` — use `unknown` + Zod.
- **Business logic in `src/server/services`**, never inside React components.
- Mutations = **Server Actions** (`"use server"`); always re-check auth + re-validate input inside.
- Validate ALL input with **Zod** (client + server).
- **Money = integer minor units** (paisa/cents). Never floats.
- **Fees: follow `docs/FEES.md`** exactly (the single source of truth). Rates are configurable
  (config/DB), not hardcoded; compute in minor units with round-half-up. Two-sided model:
  seller commission (category-based, deducted at payout) + buyer platform fee 5% (at checkout).
- All money/escrow/payout/KYC logic is **server-side only**, inside a DB transaction.
- Use the prisma singleton from `src/lib/db.ts`. Never `new PrismaClient()` elsewhere.
- Every feature: error handling + loading state + empty state + edge cases.
- Reusable components. SOLID. Clean architecture.
- **Never** leave TODOs, placeholders, or half-finished code.

---

## 7. The workflow for EVERY task (mandatory)

1. **Understand** — what, why (link to STRATEGY.md), business impact, UX impact, risks, dependencies.
2. **Analyze** — read the real files. Do not assume.
3. **Plan** — files to create, files to modify, risks, testing plan, rollback plan.
4. **Implement** — production quality, no shortcuts.
5. **Self-review** — frontend (responsive, a11y, mobile, dark mode), backend (validation,
   security, perf), db (relations, indexes, constraints, migrations).
6. **QA** — happy path, edge cases, failures, security, mobile. Fix + retest.
7. **Performance** — bundle, Lighthouse, Core Web Vitals, query/API time. Optimize + retest.
8. **Security** — authn, authz, injection, XSS, CSRF, rate limit, sessions, secrets. Fix + retest.
9. **Report** using the output format below.

Never move to the next task until all checks pass.

---

## 8. Output format for every task

```
## Task Understanding
## Current Analysis
## Plan
## Files Affected
## Risks
## Implementation
## QA Results
## Security Review
## Performance Review
## Final Status   → ✅ Pass / ❌ Fail (if fail: explain, fix, retest)
```

---

## 9. Quality gates (run before saying "done")

- `npm run typecheck` → 0 errors
- `npm run lint` → 0 errors
- `npm run build` → success
- Manual click-through of the feature in the browser

---

## 10. Security baseline (always on)

- Never commit secrets. Real values in `.env` (gitignored; Prisma + Next both read it) +
  `.env.example` (keys only, tracked).
- Money/escrow/payout/KYC logic server-side only, inside transactions.
- Check **role + ownership** on every protected route/action (buyer/seller/admin).
- Rate-limit auth, payment, and write endpoints. Bot protection on signup/login.
- Verify webhook signatures (CoinGate, Razorpay).
- Never use `dangerouslySetInnerHTML` with user content.

---

## 11. Git / deployment

- Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:`, ...).
- Tokens (GitHub / Vercel / Railway / Neon / CoinGate / Razorpay / Cloudflare R2 / Claude API)
  are provided by the owner when needed. **Never hardcode a token.**
- Deploy only after typecheck + lint + build + QA all pass.
- DB safety: use a **Neon branch per feature** so vibe coding never breaks production data.

---

## 12. Engineering guardrails (NON-NEGOTIABLE)

Full details + code patterns in `docs/ENGINEERING-GUARDRAILS.md`. **Read it before building
anything that touches money, payments, auth, escrow, or uploads.** The short version:

1. **Money = append-only ledger.** Never store/mutate a single `balance` field. Create a
   `LedgerEntry` row per credit/debit; derive balances by summing. All amounts integer minor units.
2. **Payment webhooks = idempotent + signature-verified.** Dedupe by provider event id; verify
   signature; never process the same event twice (double payout = lost money).
3. **Orders are a state machine.** Explicit statuses; only allowed transitions; crypto needs
   `awaiting_payment → underpaid/confirmed/expired`. Never treat crypto like an instant card.
4. **Neon connection pooling.** App uses the **pooled** `DATABASE_URL` (pgbouncer); migrations use
   `DIRECT_URL`. Always go through the `src/lib/db.ts` singleton.
5. **All money/escrow/payout/KYC logic is server-side, inside a DB transaction.** Never trust the client.
6. **KYC docs / PII = private R2 bucket**, short-lived signed URLs, direct browser→R2 upload, access logged.
7. **Auth on every protected action:** check session + role + ownership. Rate-limit auth/payment/write.
8. **Observability early:** wire Sentry at the payments step, not at launch.

## 13. Current status

- Phase: **Foundation → MVP**. ✅ Steps 01-04 done (scaffold · DB schema/Neon · auth+roles ·
  design system + layout). **Next: Step 05 — Game catalog (5 games, Pokémon GO first).**
- Actuals: Next.js 16.2.7, React 19, Tailwind v4, shadcn (Base UI), Prisma 6.19, secrets in `.env`.
- Design system: neon-lime brand on dark, Sora+Inter fonts; Header/Footer/MobileNav + shared UI +
  marketplace primitives in `src/components/{layout,shared,marketplace}`.
- See `docs/ROADMAP.md` for the exact step we are on.
- After finishing a step: tick it in `docs/ROADMAP.md` and log key choices in `docs/DECISIONS.md`.
