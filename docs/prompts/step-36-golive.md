# STEP 36 — Go-Live: Post-deploy Checks + Seed 10 Sellers

> Goal: Final go-live — post-deploy verification, monitoring confirmation, switch payments to LIVE,
> and seed 10 real Pokémon GO sellers with listings. MVP is LIVE.

---

## PROMPT (copy from here ⬇️)

You are the CTO + Senior DevOps + Senior QA Engineer of GETX. Read `CLAUDE.md` +
`docs/ENGINEERING-GUARDRAILS.md` (§1, §2, §4, §7, §8) + `docs/RUNBOOK.md` (if it exists).
Work in `D:\GetX`. This is **Step 36 — Go-Live: Post-deploy Checks + Seed 10 Sellers**.
Talk Hinglish. Follow the full workflow.

### Task

1. **Production verification checklist** (manual + automated):
   - Load every public route on `https://getx.live` and confirm HTTP 200, no console errors:
     `/`, `/marketplace`, `/marketplace/pokemon-go`, a listing detail page, `/auth/login`,
     `/auth/register`, `/dashboard`, `/seller/dashboard`, `/admin` (must 403 for non-admin).
   - Confirm HTTPS is enforced end-to-end (no mixed content). Check
     `https://securityheaders.com/?q=getx.live` — target grade **A** (CSP, HSTS, X-Frame-Options,
     X-Content-Type-Options, Referrer-Policy, Permissions-Policy must all be present; fix any
     gaps in `src/middleware.ts` or `next.config.ts` `headers()`).
   - Run Lighthouse CI on `/` and `/marketplace` (mobile emulation) — both must score **≥ 90**
     on Performance, Accessibility, Best Practices, SEO. Fix regressions before proceeding.
   - Test auth end-to-end in prod: register a fresh account, verify email, log in, log out.
     Confirm Cloudflare Turnstile fires with **real site/secret keys** (dev bypass must be OFF
     in prod — check `NEXT_PUBLIC_TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET_KEY` in Vercel env
     dashboard; if bypass is still active, replace both keys immediately and redeploy).
   - Confirm mobile layout on real device or BrowserStack: header, listing cards, checkout flow,
     chat, dashboard — all usable on 375 px viewport.

2. **Switch payments to LIVE**:
   - **CoinGate**: in the CoinGate dashboard, generate a live API token (not sandbox). In Vercel
     prod env, set `COINGATE_API_TOKEN=<live_token>` and `COINGATE_ENVIRONMENT=live`. Remove any
     `sandbox` or test values. Update the CoinGate webhook URL to
     `https://getx.live/api/webhooks/coingate` (HTTPS, prod). Verify the webhook is registered
     and the shared secret (used for re-fetch auth — CoinGate has no HMAC, so the pattern from
     Step 09 is: receive callback → re-fetch order from CoinGate API using the live token to
     verify authenticity before processing).
   - **Razorpay**: generate live Key ID + Key Secret from the Razorpay production dashboard. In
     Vercel prod env, set `RAZORPAY_KEY_ID=<live>`, `RAZORPAY_KEY_SECRET=<live>`. Regenerate
     the webhook secret in Razorpay → set `RAZORPAY_WEBHOOK_SECRET=<new_live_secret>`. Update
     the webhook URL to `https://getx.live/api/webhooks/razorpay`. Confirm the webhook events
     enabled: `payment.captured`, `payment.failed`, `refund.processed`.
   - **One real end-to-end paid order**: using a real UPI account or a real crypto wallet, place
     one small real order (minimum viable amount) as a buyer on `getx.live`. Confirm: (a)
     payment captured in provider dashboard, (b) webhook fires and is signature-verified in Sentry
     / server logs, (c) `ProcessedWebhook` deduplication row created, (d) `LedgerEntry` rows show
     escrow hold (`ESCROW_HOLD`) for buyer, (e) order status transitions correctly
     (`awaiting_payment → confirmed`). Do NOT deliver or release — cancel or let auto-release
     handle it, or use the admin panel to refund after confirming the hold. Log the result in
     `docs/DECISIONS.md`.

3. **Monitoring — Sentry + PostHog + Vercel Cron**:
   - **Sentry**: confirm `SENTRY_DSN` is set in Vercel prod. Deliberately trigger a test Sentry
     event from the server side: add a temporary `/api/sentry-test` route that calls
     `Sentry.captureException(new Error("go-live smoke test"))`, hit it once, confirm the event
     appears in Sentry dashboard, then delete the route + redeploy. Confirm Sentry release
     tracking + source maps are uploaded on deploy (check `sentry.config.ts` and the Vercel
     Sentry integration / `withSentryConfig` in `next.config.ts`).
   - **PostHog**: confirm `NEXT_PUBLIC_POSTHOG_KEY` + `NEXT_PUBLIC_POSTHOG_HOST` are set. Load
     the home page, open PostHog Live Events — confirm `$pageview` events arrive. Set up two
     alert rules in PostHog: (a) "Error rate spike" — if JS errors > 10/hr, notify via email;
     (b) "Order created" funnel drop — if checkout starts but no payment in 30 min > 20%. These
     are soft alerts; exact thresholds are adjustable.
   - **Vercel Cron** (auto-release): confirm `vercel.json` has the cron entry
     (`/api/cron/auto-release`, `*/15 * * * *` or per actual config). In Vercel dashboard →
     Cron Jobs, confirm the job shows as active. Wait for the next scheduled run (or trigger
     manually via the Vercel dashboard) and confirm the logs show "auto-release cron ran" with
     0 errors. If any order was eligible (past `AUTO_RELEASE_DAYS`), confirm it moved to
     `COMPLETED` and the ledger release entry was written.
   - Confirm Vercel deployment logs (`vercel logs --prod`) have no unhandled errors from
     app startup.

4. **Seed 10 Pokémon GO sellers** (`scripts/seed-launch.ts`):
   - Write `scripts/seed-launch.ts` (NOT the dev seed, NOT `prisma/seed.ts`). Gate execution
     behind a CLI confirm flag: the script must print a warning
     `"WARNING: This will INSERT real seller data into PRODUCTION. Type 'yes-launch' to continue:"`,
     read stdin, and abort unless the user types exactly `yes-launch`. The script reads
     `DATABASE_URL` from the environment (must be the prod pooled Neon URL — document this
     clearly in the script header comment).
   - Create 10 `User` + linked `SellerProfile` rows with realistic Pokémon GO seller personas:
     varied display names (e.g., "PokéTrader_Arjun", "RareCatch_Priya", etc.), unique email
     addresses using the pattern `seller{N}@getx.live` (mark them clearly as seed accounts).
     Set `kycStatus: "APPROVED"` and `trustScore: 72`–`88` (varied, earned-looking). Set
     `emailVerified: new Date()`.
   - Each seller gets 1–3 `Listing` rows:
     - At least one **ACCOUNT** type listing (e.g., "Level 40 Pokémon GO account, 350+ Pokédex,
       rare shinies, Mystic team"), realistic INR price in paise (e.g., 499900 = ₹4,999).
     - At least one **CURRENCY** or **ITEM** type listing (e.g., "1000 PokéCoins bundle — instant
       delivery", price 89900 = ₹899).
     - Titles: honest, SEO-friendly, no ALL CAPS. Descriptions: 2–3 sentences, real value prop.
     - Status: `ACTIVE`. `game`: `POKEMON_GO` (or the exact enum value from `Listing.game`).
     - `deliveryType`: use `MANUAL` for accounts/items, `INSTANT` for currency if the schema
       supports it; check `prisma/schema.prisma` and reconcile.
   - If `CLOUDFLARE_R2_*` env vars are set, upload 2–3 placeholder listing images from
     `public/` to R2 and attach as `ListingImage` rows for those listings; otherwise skip
     gracefully (log "R2 not configured — skipping images").
   - Do NOT create fake `Review`, `Order`, `LedgerEntry`, or metric rows. Trust is earned, not seeded.
   - Run the script locally against prod DB only after all other checks pass:
     `DIRECT_URL=<prod_direct_neon_url> npx tsx scripts/seed-launch.ts`.
     The script must clean up (rollback all) on any error, using a Prisma `$transaction`.
   - After seeding, browse `https://getx.live/marketplace/pokemon-go` and confirm all 10 sellers
     and their listings appear, are browsable, and the listing detail pages render correctly.

5. **Go-live ops runbook** (`docs/RUNBOOK.md`):
   - Write `docs/RUNBOOK.md` covering: (a) How to process a manual refund (admin dispute resolution
     path + direct DB command if needed). (b) How to resolve a dispute (admin panel steps). (c) How
     to mark a payout PAID. (d) How to check server logs (Vercel dashboard + `vercel logs --prod`).
     (e) How to check Sentry for errors. (f) How to rotate a secret key (env var update + redeploy
     procedure). (g) Incident response checklist (detection → triage → rollback → postmortem).
     (h) Database access: never connect with the pooled URL for long-running queries; use
     `DIRECT_URL` for Prisma Studio or psql in emergencies.
   - Keep it concise — bullet-pointed, not a novel. This file is for the owner to use at 2 AM.

6. **Soft launch**:
   - Invite a small test group (5–10 people from the owner's network) via a shared link.
   - Monitor Sentry + PostHog Live Events during the first hour. Note any errors.
   - Collect feedback via a simple Google Form or TypeForm link (add it to the `/` page as a
     small banner: "Early access — share feedback" with a link — remove after launch stabilises).
   - Do NOT announce broadly until the real paid order (Task 2) and the 10 sellers (Task 4) are
     confirmed live and browsable.

7. **Final bookkeeping**:
   - In `docs/ROADMAP.md`: tick Step 36 as done and mark **Phase 4 — Go-Live** as complete.
   - In `docs/DECISIONS.md`: add an entry dated today titled "MVP LIVE" — record the go-live date,
     the real payment test result (provider, amount, order ID), the Sentry smoke test status, and
     any issues found + resolved during this step.
   - Edge cases: CoinGate re-fetch fails (live token wrong) → order stays `awaiting_payment` and
     cron will expire it after timeout — confirm this path is safe; Razorpay webhook secret
     mismatch → returns 401 and logs to Sentry — confirm; Turnstile bypass left on → register
     blocks no bots — catch this in the verification checklist; seed script run twice → unique
     email constraint prevents duplicates — confirm the error message is clear.

### Rules

- Live provider keys (CoinGate live token, Razorpay live keys, Razorpay webhook secret) are set
  **only** in Vercel prod environment variables. They must never be committed to the repo or
  written to any file tracked by git.
- Complete at least **one real end-to-end paid order** confirming escrow hold before any public
  announcement. No shortcuts.
- Do NOT seed fake reviews, ratings, order counts, or any trust metrics. `SellerProfile.trustScore`
  and `ratingAvg` may be set to realistic but modest values only if the schema requires a non-null
  default; otherwise leave them at schema defaults.
- Every money operation in the seed script and in prod uses integer minor units (paise). No floats.

### Report back

CLAUDE.md output format + QA CHECKLIST below. Also include a short **go-live smoke test report**
(pages checked, security header grade, Lighthouse scores, payment test result, Sentry event confirmed,
PostHog event confirmed, cron run confirmed, seller/listing count live).

---

## ✅ QA CHECKLIST

- [ ] All public routes on `getx.live` return 200, no console errors
- [ ] HTTPS enforced; `securityheaders.com` reports grade **A** (CSP, HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy)
- [ ] Lighthouse ≥ 90 on Performance, Accessibility, Best Practices, SEO — both `/` and `/marketplace` (mobile)
- [ ] Cloudflare Turnstile real site key active in prod; dev bypass is OFF; registration test passes
- [ ] Mobile layout verified at 375 px: header, listing cards, checkout, chat, dashboard
- [ ] CoinGate `COINGATE_ENVIRONMENT=live`, live token set in Vercel prod, webhook URL updated to prod HTTPS
- [ ] Razorpay live Key ID + Secret set in Vercel prod; `RAZORPAY_WEBHOOK_SECRET` regenerated + set; webhook URL updated
- [ ] One real end-to-end paid order placed: payment captured in provider dashboard, webhook signature-verified, `ProcessedWebhook` row created, `LedgerEntry` escrow hold confirmed, order status correct
- [ ] Sentry: smoke test event received in Sentry dashboard; `/api/sentry-test` route deleted post-verify; source maps uploading on deploy
- [ ] PostHog: `$pageview` events visible in Live Events; two alert rules configured
- [ ] Vercel Cron auto-release job active; at least one cron run logged without errors
- [ ] `scripts/seed-launch.ts` runs against prod with `yes-launch` confirm gate; rolls back on error
- [ ] 10 Pokémon GO seller accounts + listings live on `getx.live/marketplace/pokemon-go`; all listing detail pages render
- [ ] No fake reviews, orders, or metrics seeded
- [ ] `docs/RUNBOOK.md` written and covers refund, dispute, payout, logs, key rotation, incident response
- [ ] Feedback banner live on `/` for soft-launch group
- [ ] `typecheck`/`lint`/`build` pass; mobile responsive
- [ ] Step 36 ticked; Phase 4 marked complete in `docs/ROADMAP.md`; "MVP LIVE" entry in `docs/DECISIONS.md`
- [ ] Final Status: ✅ Pass — MVP LIVE 🎉

---

## 👉 After this step

🎉 LAUNCHED. Monitor Sentry + PostHog for the first 48 hours, iterate on feedback, and then deepen
the Phase 2 / Phase 3 AI moats — Trust Score engine (Step 17), AI Dispute Judge (Step 25),
AI Pricing Advisor (Step 26), and community features (Step 27).

## 🔑 Tokens needed: **None** (live provider keys — CoinGate live token, Razorpay live Key ID + Key Secret + Webhook Secret — must already be set in Vercel prod environment variables by the owner; no new third-party integrations are added in this step).
