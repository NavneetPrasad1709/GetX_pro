# STEP 35 — CI/CD + Production Deploy

> Goal: Ship GETX to production. Wire GitHub Actions CI/CD, deploy the Next.js app to Vercel and
> the Socket.io server to Railway, point getx.live DNS at Vercel via Cloudflare, and smoke-test
> the full end-to-end flow in production (register → list → pay sandbox → deliver → confirm).

---

## PROMPT (copy from here ⬇️)

You are the CTO + Senior DevOps + Senior QA Engineer of GETX. Read `CLAUDE.md` +
`docs/ENGINEERING-GUARDRAILS.md` (§1, §4, §7, §8). Work in `D:\GetX`. This is **Step 35 — CI/CD + Production Deploy**.
Talk Hinglish. Follow the full workflow.

### Task

1. **Pre-deploy checklist (run everything locally BEFORE touching any remote)**
   - Run and verify all four quality gates pass with zero errors:
     ```
     npm run typecheck
     npm run lint
     npm run build
     ```
   - Run every QA harness script against the dev/staging DB:
     ```
     npx tsx scripts/qa-step10.ts
     npx tsx scripts/qa-step11.ts
     npx tsx scripts/qa-step11-live.ts
     ```
     Confirm each exits with `0 failures`. If any fail, fix them before proceeding.
   - Secret audit — run a grep across the entire repo and confirm zero hardcoded secrets:
     ```
     grep -rE "(sk_live|rk_live|coingate|rzp_live|AAAA[A-Za-z0-9_-]{10,}|[Ss]ecret\s*=\s*['\"][A-Za-z0-9]{20,})" \
       --include="*.ts" --include="*.tsx" --include="*.js" --include="*.json" \
       --exclude-dir=node_modules --exclude-dir=.next
     ```
     If any matches appear, remove them and re-run quality gates.
   - Confirm `.env` is in `.gitignore` and NOT in git history (`git log --all --full-history -- .env`).
   - Confirm `.env.example` is committed with all keys listed (values blank).
   - Confirm `CLAUDE.md` and all `docs/` files are committed.
   - Create a pre-deploy summary comment in `docs/DECISIONS.md`:
     ```
     ## Step 35 — Production Deploy (YYYY-MM-DD)
     - All quality gates: PASS
     - QA harnesses: PASS
     - Secret audit: CLEAN
     - Deploy targets: Vercel (Next.js app), Railway (Socket.io), Neon (existing prod DB), Cloudflare (DNS+WAF)
     ```

2. **GitHub remote + branch setup**
   - Add the remote if it does not already exist:
     ```
     git remote add origin https://github.com/GITHUB_USERNAME/getx.git
     ```
     (replace `GITHUB_USERNAME` with the actual GitHub username from the `GITHUB_USERNAME` secret).
   - Ensure the default branch is `main`. Push:
     ```
     git push -u origin main
     ```
   - Create a `.github/workflows/` directory.

3. **GitHub Actions — CI workflow** (`.github/workflows/ci.yml`)
   - Triggers: `push` to any branch, `pull_request` to `main`.
   - Jobs:
     ```yaml
     jobs:
       ci:
         runs-on: ubuntu-latest
         steps:
           - uses: actions/checkout@v4
           - uses: actions/setup-node@v4
             with:
               node-version: '20'
               cache: 'npm'
           - run: npm ci
           - run: npm run typecheck
           - run: npm run lint
           - run: npm run build
           - name: QA harnesses
             env:
               DATABASE_URL: ${{ secrets.TEST_DATABASE_URL }}
               DIRECT_URL: ${{ secrets.TEST_DIRECT_URL }}
               AUTH_SECRET: ${{ secrets.AUTH_SECRET }}
               INTERNAL_API_SECRET: ${{ secrets.INTERNAL_API_SECRET }}
               CRON_SECRET: ${{ secrets.CRON_SECRET }}
             run: |
               npx tsx scripts/qa-step10.ts
               npx tsx scripts/qa-step11.ts
     ```
   - The `TEST_DATABASE_URL` and `TEST_DIRECT_URL` secrets point at the **Neon staging branch**
     (never production). Document this in `docs/DECISIONS.md`.
   - Cache `.next/cache` using `actions/cache@v4` with key `nextjs-${{ hashFiles('package-lock.json') }}-${{ hashFiles('**/*.ts', '**/*.tsx') }}`.

4. **GitHub Actions — deploy workflow** (`.github/workflows/deploy.yml`)
   - Triggers: `push` to `main` only (not PRs).
   - Depends on the `ci` job (use `needs: ci` or inline the CI steps then deploy):
     ```yaml
     jobs:
       deploy:
         runs-on: ubuntu-latest
         needs: ci           # only deploy if CI passes
         steps:
           - uses: actions/checkout@v4
           - uses: actions/setup-node@v4
             with:
               node-version: '20'
               cache: 'npm'
           - run: npm ci
           - name: Deploy to Vercel (production)
             run: npx vercel --prod --token=${{ secrets.VERCEL_TOKEN }} --yes
             env:
               VERCEL_ORG_ID: ${{ secrets.VERCEL_ORG_ID }}
               VERCEL_PROJECT_ID: ${{ secrets.VERCEL_PROJECT_ID }}
     ```
   - Never use `--force` or `--yes` on destructive operations. The `--yes` flag here only skips
     the interactive project-link prompt; it is safe because `VERCEL_ORG_ID` + `VERCEL_PROJECT_ID`
     are explicit.

5. **GitHub repo secrets**
   - Add every secret listed below to the GitHub repo (Settings → Secrets → Actions).
     The `deploy.yml` and QA harnesses depend on all of them:
     ```
     # Database
     DATABASE_URL               # Neon prod pooled URL (pgbouncer)
     DIRECT_URL                 # Neon prod direct URL (for migrations)
     TEST_DATABASE_URL          # Neon staging branch pooled URL (CI only)
     TEST_DIRECT_URL            # Neon staging branch direct URL (CI only)

     # Auth
     AUTH_SECRET                # Auth.js secret (same value as .env)
     NEXTAUTH_URL               # https://getx.live

     # Payments
     COINGATE_API_KEY
     RAZORPAY_KEY_ID
     RAZORPAY_KEY_SECRET
     RAZORPAY_WEBHOOK_SECRET

     # Storage
     R2_ACCOUNT_ID
     R2_ACCESS_KEY_ID
     R2_SECRET_ACCESS_KEY
     R2_BUCKET_NAME
     R2_PUBLIC_URL

     # Realtime / internal
     SOCKET_AUTH_SECRET
     INTERNAL_API_SECRET
     CRON_SECRET

     # AI
     ANTHROPIC_API_KEY

     # Monitoring
     SENTRY_DSN
     NEXT_PUBLIC_SENTRY_DSN
     SENTRY_AUTH_TOKEN

     # Vercel deploy
     VERCEL_TOKEN
     VERCEL_ORG_ID
     VERCEL_PROJECT_ID

     # Turnstile (bot protection)
     NEXT_PUBLIC_TURNSTILE_SITE_KEY
     TURNSTILE_SECRET_KEY
     ```
   - After adding all secrets, verify them by re-running CI manually via the GitHub Actions UI
     (`workflow_dispatch`). Do not proceed to Vercel until CI is green on GitHub.

6. **Vercel — link + env vars + first prod deploy**
   - Install the Vercel CLI globally if not present: `npm i -g vercel`.
   - Login: `vercel login --token $VERCEL_TOKEN`.
   - Link the project to Vercel (run once locally):
     ```
     vercel link --yes --token $VERCEL_TOKEN
     ```
     This creates `.vercel/project.json` with `orgId` and `projectId`. Commit `.vercel/project.json`
     (it is NOT a secret; the actual token lives only in GitHub secrets and your local env).
   - Set all production environment variables in Vercel. Use the Vercel dashboard
     (Project → Settings → Environment Variables) or CLI:
     ```
     vercel env add DATABASE_URL production
     vercel env add DIRECT_URL production
     vercel env add AUTH_SECRET production
     vercel env add NEXTAUTH_URL production
     # ... repeat for every key in .env.example
     ```
     Every key in `.env.example` must have a value in Vercel `production` environment before the
     first prod deploy. Keys with `NEXT_PUBLIC_` prefix must also be set; they are baked into the
     client bundle at build time.
   - **Crons in `vercel.json`**: confirm these entries exist (add if missing):
     ```json
     {
       "crons": [
         { "path": "/api/cron/auto-release",    "schedule": "0 * * * *"  },
         { "path": "/api/cron/trust-score",     "schedule": "0 2 * * *"  },
         { "path": "/api/cron/demand-signals",  "schedule": "0 3 * * *"  },
         { "path": "/api/cron/algolia-sync",    "schedule": "0 4 * * *"  }
       ]
     }
     ```
     Note: `*/15 * * * *` (every 15 min) requires Vercel Pro. On Hobby, use `0 * * * *` (hourly)
     for `auto-release`. Document the plan in `docs/DECISIONS.md` so it is upgraded when the team
     moves to Pro.
   - Run the first production deploy from local to verify everything works before CI takes over:
     ```
     vercel --prod --token $VERCEL_TOKEN
     ```
   - After deploy, confirm:
     - `https://getx.live` returns HTTP 200 (or 3xx→200).
     - `https://getx.live/api/health` returns `{ "ok": true, "ts": "<ISO timestamp>" }` with HTTP 200.

7. **Health route** (`src/app/api/health/route.ts`)
   - Create a minimal unauthenticated `GET` handler:
     ```ts
     import { NextResponse } from "next/server";

     export const runtime = "nodejs";

     export async function GET() {
       return NextResponse.json({ ok: true, ts: new Date().toISOString() });
     }
     ```
   - This route is used by Vercel health checks, Railway health checks, uptime monitors, and the
     QA harness. It must never require auth. It must return 200 within 500 ms.
   - No DB ping in the health route — that belongs in a separate `/api/health/deep` route (out of
     scope for this step). The shallow health check is enough for load-balancer probes.

8. **Railway — Socket.io server deploy**
   - The `socket-server/` directory is a standalone Node.js service (see `socket-server/README.md`).
     Deploy it as a separate Railway service (not a Dockerfile unless one already exists — use
     the `package.json` start script).
   - In the Railway project dashboard, create a new service pointed at the `socket-server/` subdirectory
     of the same GitHub repo (Railway supports monorepo root directory selection).
   - Set the following environment variables on the Railway service:
     ```
     SOCKET_AUTH_SECRET      # same value as the Vercel/Next app
     INTERNAL_API_SECRET     # same value as the Vercel/Next app
     ALLOWED_ORIGIN          # https://getx.live  (the production storefront URL)
     APP_URL                 # https://getx.live  (used by the socket server to call internal APIs)
     PORT                    # Railway injects this automatically; the socket server must read process.env.PORT
     NODE_ENV                # production
     ```
   - After deploy, obtain the Railway-generated public URL (e.g., `https://getx-socket.up.railway.app`).
   - Set `NEXT_PUBLIC_SOCKET_URL=https://getx-socket.up.railway.app` in Vercel (production env var).
     Re-deploy Vercel so the new env var is baked into the client bundle.
   - Smoke-test the socket connection: open `https://getx.live` in a browser, open DevTools →
     Network → WS filter, navigate to the Messages page, and confirm a WebSocket connection is
     established to the Railway URL. Check the Railway service logs for a successful handshake.

9. **Cloudflare — DNS + WAF**
   - In the Cloudflare dashboard for `getx.live`:
     - Add a `CNAME` record: `getx.live` → Vercel's assigned domain (e.g., `cname.vercel-dns.com`),
       proxy enabled (orange cloud). This routes traffic through Cloudflare WAF.
     - Add a `CNAME` record for `www.getx.live` → same Vercel domain, proxy enabled.
     - In Vercel, add both `getx.live` and `www.getx.live` as custom domains on the project.
   - Confirm Cloudflare SSL/TLS mode is set to **Full (strict)** — Vercel provides a valid cert,
     so `Flexible` is insecure.
   - Confirm the WAF rules from Step 32 are still active (if Step 32 has been completed). If Step 32
     has not been completed, enable Cloudflare's **Managed Ruleset** (free tier) as a minimum.
   - Verify DNS propagation: `dig getx.live +short` should return Cloudflare IPs (not Vercel IPs
     directly — because proxied = traffic goes through Cloudflare first).

10. **Update payment provider webhook URLs to production**
    - **Razorpay**: in the Razorpay dashboard → Webhooks, update the webhook URL from the dev/staging
      URL to `https://getx.live/api/webhooks/razorpay`. Re-verify that the webhook secret matches
      `RAZORPAY_WEBHOOK_SECRET` in production Vercel env vars.
    - **CoinGate**: in the CoinGate dashboard → API → Webhooks (or per-order callback URL config),
      update to `https://getx.live/api/webhooks/coingate`. Confirm the CoinGate auth token matches
      `COINGATE_API_KEY`.
    - **Critical**: neither webhook URL may contain the word `razorpay` or `coingate` in a
      predictable pattern (some providers block generic patterns). Current routes
      `/api/webhooks/razorpay` and `/api/webhooks/coingate` are fine — they match the existing code.
      Confirm the routes exist in the deployed app by hitting them with a GET (expect 405 Method
      Not Allowed, not 404) — 405 confirms the route handler exists and only accepts POST.
    - Test webhook delivery in sandbox mode end-to-end (see smoke test in item 11).

11. **Post-deploy smoke test (production with sandbox payment credentials)**
    - Use sandbox/test API keys for CoinGate and Razorpay so real money is never moved.
    - Flow to verify manually in the browser on `https://getx.live`:
      1. Register a new buyer account → verify email (or check the email delivery / skip if email
         not yet wired).
      2. Register a new seller account → complete onboarding → create a test listing (game:
         Pokemon GO, price: ₹100 INR or equivalent minor units).
      3. As buyer, open the listing → proceed to checkout → pay via Razorpay test card
         (`4111 1111 1111 1111`, any future expiry, any CVV).
      4. Confirm the order transitions: `PENDING → AWAITING_PAYMENT → CONFIRMED` (or `PAID`
         depending on the state machine labels — check `prisma/schema.prisma`).
      5. As seller, navigate to `/dashboard/seller/orders`, find the order, click Deliver, upload
         delivery proof.
      6. As buyer, confirm receipt → order transitions to `COMPLETED`.
      7. Verify seller wallet balance increased by the expected amount (listing price minus seller
         commission fee, as per `docs/FEES.md`).
      8. Verify the cron `/api/cron/auto-release` can be triggered manually (call it with the
         correct `CRON_SECRET` bearer header — use `curl` or Insomnia/Postman) and returns 200.
    - Document any failures and fix before marking the step done.

12. **QA harness** (`scripts/qa-step35.ts`)
    - Follow the repo convention: `npx tsx scripts/qa-step35.ts`, `ok(label)` / `threw(label, fn)`
      helpers, all test data cleaned up in `finally`.
    - Test cases to cover programmatically (against the **production** or **staging** URL —
      read `NEXT_PUBLIC_APP_URL` or `QA_BASE_URL` from env):
      - **Health route**: `GET /api/health` → 200, `{ ok: true }`, responds within 500 ms.
      - **Webhook route existence**: `GET /api/webhooks/razorpay` → 405 (not 404).
      - **Webhook route existence**: `GET /api/webhooks/coingate` → 405 (not 404).
      - **Cron auth**: `GET /api/cron/auto-release` without bearer → 401.
      - **Cron auth**: `GET /api/cron/auto-release` with correct `CRON_SECRET` bearer → 200.
      - **Cron auth**: `GET /api/cron/trust-score` with correct `CRON_SECRET` bearer → 200.
      - **Auth-protected route**: `GET /dashboard` without session → redirect to `/login` (3xx).
      - **Homepage**: `GET /` → 200, response includes `<html`.
      - **Socket server health**: if `NEXT_PUBLIC_SOCKET_URL` is set, `GET $SOCKET_URL/health`
        (or `/`) → non-500 response (the socket server should expose a simple HTTP health endpoint).
    - The harness must NOT place real orders or move real money. It is a connectivity + auth check only.
    - Print a deployment summary at the end:
      ```
      ✅  /api/health                 200
      ✅  /api/webhooks/razorpay      405
      ✅  /api/webhooks/coingate      405
      ✅  /api/cron/auto-release      401 (no token) / 200 (correct token)
      ✅  Socket server reachable
      ```

13. **Edge cases**
    - Neon connection pooling in production: `DATABASE_URL` must be the **pooled** pgbouncer URL
      (contains `?pgbouncer=true` or is the `pooler.` subdomain). `DIRECT_URL` is the direct URL
      (used only by `prisma migrate deploy`). Never swap these — the app crashes on serverless
      if given the direct URL at high concurrency. Verify this in the Neon dashboard.
    - Vercel function timeouts: default is 10 s on Hobby, 60 s on Pro. The escrow auto-release
      cron may process many rows — if it times out, add `export const maxDuration = 60` to
      `src/app/api/cron/auto-release/route.ts` (Pro only; document in DECISIONS.md if this is
      needed).
    - `NEXT_PUBLIC_*` env vars are baked at build time. If you update `NEXT_PUBLIC_SOCKET_URL`
      after the first deploy, you must re-deploy (not just restart) for the change to take effect.
    - Socket server `ALLOWED_ORIGIN` must exactly match the production storefront URL including
      scheme and without a trailing slash (e.g., `https://getx.live`, not `https://getx.live/`).
      CORS will reject socket connections otherwise.
    - CoinGate webhooks: CoinGate does NOT send an HMAC signature — verification is done by
      re-fetching the order from the CoinGate API using the `COINGATE_API_KEY` (per the Step 09
      patterns in memory). Confirm this behaviour is preserved in production; do not add an HMAC
      check that would reject valid CoinGate events.
    - Razorpay webhooks: raw body HMAC verification is required. Confirm `src/app/api/webhooks/razorpay/route.ts`
      reads the raw body (not the parsed JSON) before computing the HMAC — Next.js body parsing
      strips the raw bytes needed for HMAC. If using `request.text()` → this is correct.
    - `ProcessedWebhook` deduplication: the prod DB must have the `ProcessedWebhook` table (run
      any pending migrations via `prisma migrate deploy` on the production Neon branch before
      deploying app code).
    - Run pending migrations against production BEFORE the app deploy — never after — to avoid
      the app starting against a schema it expects to exist but doesn't:
      ```
      npx prisma migrate deploy
      ```
      Use `DIRECT_URL` (not `DATABASE_URL`) for migrations. Set it temporarily in your local
      `.env` pointing at the production Neon branch, or run via the Neon console.
    - Sentry: confirm `SENTRY_DSN` and `NEXT_PUBLIC_SENTRY_DSN` are set in Vercel production env.
      After the first deploy, trigger a test error (e.g., visit a non-existent route) and confirm
      it appears in the Sentry dashboard within 60 s.
    - Cloudflare proxy caching: static assets (`/_next/static/`) should be cached; API routes
      and dynamic pages must NOT be cached. Add a Cloudflare Page Rule or Cache Rule:
      `getx.live/api/*` → Cache Level: Bypass. Also bypass cache for `/_next/data/*`.

### Rules
- Deploy to production ONLY after `typecheck` + `lint` + `build` + all QA harnesses pass locally
  with zero failures. No exceptions.
- Never commit real secret values. All production secrets live in GitHub repo secrets and Vercel
  env vars only. `.env` stays gitignored. `.env.example` contains only key names.
- Use a dedicated Neon branch for staging/CI (`TEST_DATABASE_URL`). Never point CI at the
  production DB — a QA harness that inserts test data and fails mid-cleanup would corrupt prod.
- Run `prisma migrate deploy` against production BEFORE the code deploy, not after. Schema changes
  must be backward-compatible (additive only at this stage) so an in-progress deploy does not
  break active requests.

### Report back
CLAUDE.md output format + QA CHECKLIST below. Also include a **deploy summary** (Vercel URL,
Railway URL, Cloudflare status, webhook URLs updated Y/N, smoke test result).

---

## ✅ QA CHECKLIST
- [ ] `npm run typecheck` passes with 0 errors locally
- [ ] `npm run lint` passes with 0 errors locally
- [ ] `npm run build` succeeds locally (no type errors in build output)
- [ ] `npx tsx scripts/qa-step10.ts` — all assertions pass (0 failures)
- [ ] `npx tsx scripts/qa-step11.ts` — all assertions pass (0 failures)
- [ ] Secret grep returns zero matches (no hardcoded tokens or secrets in tracked files)
- [ ] `.env` is in `.gitignore` and NOT in git history
- [ ] `.env.example` is committed and contains every key from the production env vars list
- [ ] `.github/workflows/ci.yml` exists; CI job runs on push to any branch and on PRs to `main`
- [ ] `.github/workflows/deploy.yml` exists; deploy triggers only on push to `main`, requires CI to pass
- [ ] All GitHub repo secrets are set (verified by running CI manually via `workflow_dispatch`)
- [ ] CI is green on GitHub (green checkmark on `main` branch)
- [ ] `.vercel/project.json` committed (contains `orgId` + `projectId`, no secrets)
- [ ] All keys from `.env.example` have values set in Vercel `production` environment
- [ ] Crons registered in `vercel.json`: `auto-release`, `trust-score`, `demand-signals`, `algolia-sync`
- [ ] `src/app/api/health/route.ts` exists; `GET /api/health` → 200 `{ ok: true, ts: "..." }`
- [ ] First production Vercel deploy succeeds; `https://getx.live` returns 200
- [ ] Pending Prisma migrations deployed to production Neon branch BEFORE app code deploy
- [ ] Socket.io server deployed to Railway; Railway service is in `ACTIVE` / `DEPLOYED` state
- [ ] `NEXT_PUBLIC_SOCKET_URL` set to Railway URL in Vercel production env; re-deployed
- [ ] WebSocket connection confirmed in browser DevTools on `https://getx.live/messages`
- [ ] `getx.live` DNS points to Vercel via Cloudflare proxy (orange cloud); SSL mode = Full (strict)
- [ ] `GET /api/webhooks/razorpay` → 405 (route exists, POST-only); same for `/api/webhooks/coingate`
- [ ] Razorpay webhook URL updated to `https://getx.live/api/webhooks/razorpay` in Razorpay dashboard
- [ ] CoinGate webhook/callback URL updated to `https://getx.live/api/webhooks/coingate` in CoinGate dashboard
- [ ] Smoke test passes: register → list → sandbox pay → deliver → confirm → seller wallet updated
- [ ] Cron manual trigger: `GET /api/cron/auto-release` with correct bearer → 200; without bearer → 401
- [ ] Sentry test error appears in Sentry dashboard within 60 s of first prod deploy
- [ ] `scripts/qa-step35.ts` — all connectivity assertions pass against production URL
- [ ] `typecheck`/`lint`/`build` pass; mobile responsive (smoke test performed on 375 px viewport)
- [ ] Step 35 ticked in `docs/ROADMAP.md`; deploy decisions logged in `docs/DECISIONS.md`
- [ ] Final Status: ✅ Pass

---

## 👉 After this step
GETX is live on `https://getx.live`. Tell me **"Step 35 done"** → **Step 36 — Go-live + seed 10
sellers** (Pokemon GO). Onboard the first real sellers, verify the full flow with real money in
small amounts, and start collecting feedback.

## 🔑 Tokens needed: **`VERCEL_TOKEN`**, **`VERCEL_ORG_ID`**, **`VERCEL_PROJECT_ID`**, **`RAILWAY_TOKEN`**, **`GITHUB_USERNAME`** + all app env vars as GitHub repo secrets and Vercel production environment variables (see the full list in Task 5).
