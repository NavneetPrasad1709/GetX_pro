# GETX — Launch Accounts & Keys Checklist

> Everything you need to create an account for + every key/secret to set before deploy.
> The app is **env-safe**: anything marked 🟢 OPTIONAL can stay empty and the app still runs
> (that feature just degrades gracefully). 🔴 REQUIRED = the app won't run / a core flow breaks
> without it. 🟡 RECOMMENDED = works without, but you really want it at launch.
>
> Set all of these as **Environment Variables in the Vercel project** (Production) — and a few
> also in the **Railway** socket-server. Full key list lives in `.env.example`.

---

## 0. Secrets you GENERATE yourself (no account — just run a command)

| Env var | How to generate | Used for |
|---|---|---|
| `AUTH_SECRET` | `npx auth secret`  (or `openssl rand -base64 32`) | Session/JWT encryption |
| `CRON_SECRET` | `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` | Protects all Vercel cron jobs (escrow auto-release etc.) |
| `SOCKET_AUTH_SECRET` | same random-hex command | Signs the chat socket token (set SAME value in app + Railway) |
| `INTERNAL_API_SECRET` | same random-hex command | App ↔ socket-server internal auth (SAME value both sides) |
| `DELIVERY_ENCRYPTION_KEY` | `openssl rand -hex 32` (must be 64 hex chars) | Encrypts auto-delivery item content. ⚠️ Pick ONCE — rotating means re-encrypting all items |
| `RAZORPAY_WEBHOOK_SECRET` | you choose any random string | Paste the SAME string into the Razorpay webhook config |

---

## 1. 🔴 REQUIRED — hosting & infrastructure (create these accounts)

| Service | Sign up at | What to grab → env var |
|---|---|---|
| **Vercel** (hosts the Next.js app) | vercel.com | Connect the GitHub repo. Set all env vars here. Get the prod URL → `NEXT_PUBLIC_APP_URL` (e.g. `https://getx.live`) |
| **Neon** (Postgres DB) | neon.tech | Create a project → **pooled** connection string → `DATABASE_URL`; **direct** connection string → `DIRECT_URL` |
| **Railway** (the Socket.io chat server) | railway.app | Deploy `socket-server/`. Get its public URL → `NEXT_PUBLIC_SOCKET_URL` (in the app) + `SOCKET_INTERNAL_URL`. Set `SOCKET_AUTH_SECRET` + `INTERNAL_API_SECRET` there too (same values as the app) |
| **Cloudflare** (DNS + Turnstile + R2 — one account, three services) | cloudflare.com | Used below for Turnstile + R2; also point the `getx.live` domain here |
| **GitHub** (repo + CI) | github.com | Push the repo. The CI (`.github/workflows/ci.yml`) runs on push — uses a throwaway Postgres, **no extra account needed** |

---

## 2. 🔴 REQUIRED — to run a functioning marketplace

| Service | Sign up at | What to grab → env var | Why |
|---|---|---|---|
| **Cloudflare Turnstile** | Cloudflare dash → Turnstile → Add site | `NEXT_PUBLIC_TURNSTILE_SITE_KEY` + `TURNSTILE_SECRET_KEY` (set `TURNSTILE_DEV_BYPASS=false`) | Bot protection on signup/login (fail-closed in prod) |
| **Cloudflare R2** (image + KYC storage) | Cloudflare dash → R2 | `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`. Create **TWO buckets**: public → `R2_PUBLIC_BUCKET` + a public domain → `R2_PUBLIC_BASE_URL`; private → `R2_PRIVATE_BUCKET` | Listing images (public) + KYC docs (private). Uploads are disabled without it |
| **Razorpay** (UPI / INR payments) | razorpay.com | `RAZORPAY_KEY_ID` + `RAZORPAY_KEY_SECRET` (use TEST keys first). Create a webhook → URL `https://getx.live/api/webhooks/razorpay`, paste your `RAZORPAY_WEBHOOK_SECRET` there | Indian buyers pay via UPI |
| **CoinGate** (crypto payments) | sandbox.coingate.com (test) → coingate.com (live) | `COINGATE_API_KEY`; `COINGATE_ENVIRONMENT=sandbox` while testing, `live` at launch | Crypto buyers. (No HMAC secret — we verify by per-order token) |

> You can launch with **just Razorpay** if you don't want crypto on day one — CoinGate is independent.

---

## 3. 🟡 RECOMMENDED — set these at launch (works without, but you want them)

| Service | Sign up at | env var(s) | Why |
|---|---|---|---|
| **Resend** (email) | resend.com | `RESEND_API_KEY` + `RESEND_FROM_EMAIL` (e.g. `GETX <notifications@getx.live>`). **Verify your sending domain** (Domains → add DNS records) so mail isn't spam-filtered | Email verification + password reset + order/notification emails. Without it, in-app notifications still work but no email is sent |
| **Anthropic / Claude** (AI features) | platform.claude.com | `ANTHROPIC_API_KEY` | Turns ON: AI Support chat, **AI Dispute Judge** (auto-resolves clear disputes), listing drafter, AI pricing. All dormant/manual without it |
| **Sentry** (error monitoring) | sentry.io | `NEXT_PUBLIC_SENTRY_DSN` + `SENTRY_DSN` (same value). Optional build-time: `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN` for readable stack traces. Then set 2 alert rules in the dashboard | See production errors. Silent without a DSN |

---

## 4. 🟢 OPTIONAL — add later when scaling (graceful fallback today)

| Service | Sign up at | env var(s) | Fallback if empty |
|---|---|---|---|
| **Upstash** (Redis, rate-limit) | upstash.com → Redis → REST | `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` | Per-instance in-memory limiter (still stops basic brute force) |
| **Algolia** (search) | algolia.com | `ALGOLIA_APP_ID`, `ALGOLIA_ADMIN_KEY`, `NEXT_PUBLIC_ALGOLIA_APP_ID`, `NEXT_PUBLIC_ALGOLIA_SEARCH_KEY` + run `npx tsx src/scripts/algolia-setup-index.ts` | Postgres search (fine at launch) |
| **Sumsub** (automated KYC) | sumsub.com | `SUMSUB_APP_TOKEN`, `SUMSUB_SECRET_KEY` (+ webhook `https://getx.live/api/webhooks/sumsub`) | Manual KYC (R2 upload + admin review) |
| **PostHog** (product analytics) | posthog.com | `NEXT_PUBLIC_POSTHOG_KEY` (+ `NEXT_PUBLIC_POSTHOG_HOST`) | No analytics (zero overhead) |
| **OpenAI** (dispute-judge embeddings) | platform.openai.com | `OPENAI_API_KEY` | Keyword-vector fallback (works offline) |
| **Google / Discord** (social login) | console.cloud.google.com / discord.com/developers | `GOOGLE_CLIENT_ID`+`GOOGLE_CLIENT_SECRET` / `DISCORD_CLIENT_ID`+`DISCORD_CLIENT_SECRET` | Email/password login only (each provider OFF until both its keys are set) |

---

## 5. Security / misc flags (Step 32 — all optional, sensible defaults)

| Env var | Default | Set at launch? |
|---|---|---|
| `RAZORPAY_WEBHOOK_IPS` / `COINGATE_WEBHOOK_IPS` | empty = open | Optional: comma-separated provider IPs for defense-in-depth (caveat: behind Cloudflare orange-cloud use DNS-only on webhook routes) |
| `CSP_NONCE_ENABLED` | `false` | Flip to `true` AFTER verifying checkout (Razorpay) + OAuth work with it on |
| `NEXT_PUBLIC_SUPPORT_ENABLED` | `true` | Shows the AI support widget (self-hides if no Anthropic key) |
| `TEST_DATABASE_URL` | empty | Only for local integration tests (a disposable Neon branch) — NOT prod |
| **Cloudflare WAF** | — | Dashboard step: enable managed rules + rate-limit rules on `/api/auth/*` and `/api/webhooks/*` |

---

## Quick "minimum to go live" set

To deploy a **working** marketplace you minimally need:
**Vercel + Neon + Railway + GitHub** (hosting) · **Turnstile + R2** (Cloudflare) · **Razorpay** (payments) ·
the **6 generated secrets** (section 0) · `NEXT_PUBLIC_APP_URL`.
Add **Resend + Anthropic + Sentry** (section 3) for a polished launch. Everything in section 4 can wait.
