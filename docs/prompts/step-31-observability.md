# STEP 31 — Observability (Sentry + PostHog)

> Goal: Harden production visibility by completing Sentry error monitoring (source maps, user
> context, error boundaries) and wiring PostHog product analytics with six key business events —
> all privacy-safe, all env-degradable.

---

## PROMPT (copy from here ⬇️)

You are the CTO + Senior Full-Stack + Senior QA Engineer of GETX. Read `CLAUDE.md` +
`docs/ENGINEERING-GUARDRAILS.md` (§7, §8) + `docs/DECISIONS.md`. Work in `D:\GetX`. This is
**Step 31 — Observability (Sentry + PostHog)**. Talk Hinglish. Follow the full workflow.

### Task

1. **Sentry: complete the Step 09 scaffold** (`next.config.ts`, `sentry.client.config.ts`,
   `sentry.server.config.ts`, `sentry.edge.config.ts`):

   a. **`next.config.ts`** — wrap the existing config with `withSentryConfig`:
      ```ts
      import { withSentryConfig } from '@sentry/nextjs';

      const nextConfig = { /* existing options */ };

      export default withSentryConfig(nextConfig, {
        org: process.env.SENTRY_ORG,
        project: process.env.SENTRY_PROJECT,
        authToken: process.env.SENTRY_AUTH_TOKEN,
        silent: true,                        // no noise in CI
        widenClientFileUpload: true,
        hideSourceMaps: true,                // source maps uploaded but NOT served to browsers
        disableLogger: true,
        automaticVercelMonitors: false,      // we configure Vercel Cron monitors manually
      });
      ```
      Degrade gracefully: if `SENTRY_ORG` / `SENTRY_PROJECT` / `SENTRY_AUTH_TOKEN` are absent,
      `withSentryConfig` still works (source maps simply won't upload). Do NOT throw or crash the
      build.

   b. **`sentry.client.config.ts`** (create if missing, update if present):
      ```ts
      import * as Sentry from '@sentry/nextjs';

      Sentry.init({
        dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
        environment: process.env.NODE_ENV,
        tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
        replaysSessionSampleRate: 0,         // no session replays at MVP (cost)
        replaysOnErrorSampleRate: 0,
        enabled: !!process.env.NEXT_PUBLIC_SENTRY_DSN,
      });
      ```

   c. **`sentry.server.config.ts`** and **`sentry.edge.config.ts`** — mirror the client config
      (same DSN env var, same `tracesSampleRate`, `enabled` guard). Server config also sets
      `spotlight: process.env.NODE_ENV === 'development'` for local dev visibility.

   d. **`.env.example`** — ensure these keys are listed (add only if missing):
      ```
      SENTRY_AUTH_TOKEN=
      SENTRY_ORG=
      SENTRY_PROJECT=
      NEXT_PUBLIC_SENTRY_DSN=
      ```

2. **Sentry: `setUser` after login** (`src/lib/auth.ts` or Auth.js callbacks):

   - In the Auth.js `session` callback (or `signIn` callback, whichever fires client-side after
     a successful login), call:
     ```ts
     // client-side only — import guard required
     if (typeof window !== 'undefined') {
       const Sentry = await import('@sentry/nextjs');
       Sentry.setUser({ id: session.user.id, email: session.user.email ?? undefined });
     }
     ```
   - On sign-out, call `Sentry.setUser(null)` to clear the user context.
   - This must be a client-side-only code path (never in a server action or API route — server
     Sentry does not persist user context across requests in serverless).
   - In `src/components/layout/site-header.tsx` (or wherever the `useSession` hook is consumed),
     add a `useEffect` that calls `Sentry.setUser` whenever the session changes. This is the
     simplest reliable pattern for App Router RSC layouts.

3. **Sentry: error boundaries** on the three highest-risk surface areas:

   Create `src/components/shared/sentry-error-boundary.tsx` — a thin re-export of
   `@sentry/nextjs`'s `ErrorBoundary` with a GETX-branded fallback UI (dark background, blue
   accent `#4d7cfe`, "Something went wrong" message, a "Try again" reload button, Poppins font
   via className). Example:
   ```tsx
   'use client';
   import { ErrorBoundary } from '@sentry/nextjs';
   export { ErrorBoundary as SentryErrorBoundary };
   export function DefaultFallback() { /* branded fallback */ }
   ```

   Wrap these three layout/page files:
   - `src/app/(shop)/listing/[slug]/page.tsx` — wrap the listing detail content in
     `<SentryErrorBoundary fallback={<DefaultFallback />}>`.
   - `src/app/(shop)/checkout/page.tsx` (or the checkout route introduced in Step 08) — same
     wrapper; checkout errors must be captured immediately.
   - `src/app/(dashboard)/layout.tsx` (the shared dashboard layout) — wraps all buyer + seller
     dashboard pages in one boundary.

   Do NOT wrap the root `src/app/layout.tsx` (Next.js has its own global error.tsx for that).
   Create or update `src/app/error.tsx` and `src/app/global-error.tsx` if they don't exist:
   both should call `Sentry.captureException(error)` and render the branded fallback.

4. **Sentry: verify with a test error** (`src/app/api/debug/sentry-test/route.ts`):

   Create a temporary (but committed) debug endpoint that is **ADMIN-only**:
   ```ts
   import { auth } from '@/lib/auth';
   import * as Sentry from '@sentry/nextjs';
   import { NextResponse } from 'next/server';

   export async function GET() {
     const session = await auth();
     if (session?.user?.role !== 'ADMIN') {
       return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
     }
     Sentry.captureException(new Error('[GETX] Sentry test error — Step 31 verification'));
     return NextResponse.json({ ok: true, message: 'Test error sent to Sentry.' });
   }
   ```
   - Document in the QA section below: hit this endpoint as admin after deploy → confirm the event
     appears in the Sentry dashboard under the configured project.

5. **Sentry: manual alert rules** (no code — instruct the developer):

   In the final report, include a callout block instructing the developer to configure these two
   alert rules in the Sentry dashboard (`Project → Alerts → Create Alert`):
   - **New issue**: trigger on first occurrence of any new issue → notify via email.
   - **Error rate spike**: trigger when error rate exceeds 1% of sessions over a 10-minute
     window → notify via email (or Slack webhook if configured).

6. **PostHog: install and configure**:

   a. **Install packages**:
      ```
      npm install posthog-js posthog-node
      ```

   b. **`.env.example`** — add if missing:
      ```
      NEXT_PUBLIC_POSTHOG_KEY=
      NEXT_PUBLIC_POSTHOG_HOST=https://app.posthog.com
      ```

   c. **Client-side PostHog provider** (`src/components/analytics/posthog-provider.tsx`):
      ```tsx
      'use client';
      import posthog from 'posthog-js';
      import { PostHogProvider as PHProvider } from 'posthog-js/react';
      import { useEffect } from 'react';

      export function PostHogProvider({ children }: { children: React.ReactNode }) {
        useEffect(() => {
          const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
          const host = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? 'https://app.posthog.com';
          if (!key) return;                  // env-safe: silently skip if key absent
          posthog.init(key, {
            api_host: host,
            capture_pageview: false,         // manual pageview below (App Router SPA nav)
            capture_pageleave: true,
            autocapture: true,               // clicks, forms, inputs
            persistence: 'localStorage',
            loaded(ph) {
              if (process.env.NODE_ENV === 'development') ph.debug();
            },
          });
        }, []);

        const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
        if (!key) return <>{children}</>;    // no provider wrapping when key absent
        return <PHProvider client={posthog}>{children}</PHProvider>;
      }
      ```

   d. **Pageview tracking** — create `src/components/analytics/posthog-pageview.tsx`:
      ```tsx
      'use client';
      import { usePathname, useSearchParams } from 'next/navigation';
      import { usePostHog } from 'posthog-js/react';
      import { useEffect } from 'react';

      export function PostHogPageview() {
        const pathname = usePathname();
        const searchParams = useSearchParams();
        const posthog = usePostHog();

        useEffect(() => {
          if (!posthog) return;
          const url = pathname + (searchParams.toString() ? `?${searchParams.toString()}` : '');
          posthog.capture('$pageview', { $current_url: url });
        }, [pathname, searchParams, posthog]);

        return null;
      }
      ```
      Wrap this component in a `<Suspense>` boundary inside the root layout (required because
      `useSearchParams` suspends):
      ```tsx
      <Suspense fallback={null}>
        <PostHogPageview />
      </Suspense>
      ```

   e. **Root layout wiring** (`src/app/layout.tsx`):
      - Import `PostHogProvider` and `PostHogPageview`.
      - Wrap the existing `<body>` children with `<PostHogProvider>`.
      - Place `<PostHogPageview />` (inside its `<Suspense>`) just inside the provider, before
        the page children. Do not break existing Sentry, auth, or theme providers.

7. **PostHog: server singleton** (`src/lib/posthog.ts`):

   ```ts
   import { PostHog } from 'posthog-node';

   let _client: PostHog | null = null;

   export function getPostHogServer(): PostHog | null {
     const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
     const host = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? 'https://app.posthog.com';
     if (!key) return null;                 // env-safe
     if (!_client) {
       _client = new PostHog(key, { host, flushAt: 1, flushInterval: 0 });
     }
     return _client;
   }
   ```
   - `flushAt: 1` + `flushInterval: 0` ensures serverless functions flush before the process
     freezes. This is the standard pattern for Next.js + posthog-node on Vercel.
   - Always null-check the return value before calling `.capture()`.

8. **PostHog: six custom events** — implement captures at the correct call sites with only
   **non-PII props** (IDs + amounts only — NO names, emails, usernames, or any PII):

   a. **`listing_viewed`** — in `src/app/(shop)/listing/[slug]/page.tsx` (server component):
      After resolving the listing, call via the server singleton:
      ```ts
      getPostHogServer()?.capture({
        distinctId: session?.user?.id ?? 'anonymous',
        event: 'listing_viewed',
        properties: {
          listingId: listing.id,
          gameId: listing.gameId,
          categoryKind: listing.category.kind,
          priceMinor: listing.priceMinor,
        },
      });
      ```

   b. **`checkout_started`** — in `src/server/actions/orders.ts` (or wherever the order creation
      Server Action lives, introduced in Step 08), after the order row is successfully created:
      ```ts
      getPostHogServer()?.capture({
        distinctId: userId,
        event: 'checkout_started',
        properties: { orderId: order.id, listingId: order.listingId },
      });
      ```

   c. **`payment_initiated`** — in the payment initiation server action / API route (Step 09),
      after successfully creating the CoinGate or Razorpay order (before redirect):
      ```ts
      getPostHogServer()?.capture({
        distinctId: userId,
        event: 'payment_initiated',
        properties: {
          orderId: order.id,
          provider: 'coingate' | 'razorpay',   // string literal from the route
          amountMinor: order.totalMinor,
        },
      });
      ```

   d. **`order_completed`** — in `src/server/services/escrow.ts`, inside `releaseOrder` (or
      `confirmReceipt`), immediately after the DB transaction that sets order status to
      `COMPLETED`:
      ```ts
      getPostHogServer()?.capture({
        distinctId: order.buyerId,
        event: 'order_completed',
        properties: {
          orderId: order.id,
          sellerId: order.sellerId,
          amountMinor: order.subtotalMinor,
        },
      });
      ```
      This is the server-side "backend truth" event — never rely on the client to fire this.

   e. **`seller_onboarded`** — in `src/server/actions/` (wherever `becomeSeller` / seller
      onboarding is handled, introduced in Step 06), after the `SellerProfile` row is created:
      ```ts
      getPostHogServer()?.capture({
        distinctId: userId,
        event: 'seller_onboarded',
        properties: { sellerId: sellerProfile.id },
      });
      ```

   f. **`search_performed`** — in `src/server/services/marketplace.ts`, after the search query
      returns results (same location as Step 26's `SearchLog` fire-and-forget):
      ```ts
      getPostHogServer()?.capture({
        distinctId: 'anonymous',             // search is unauthenticated; never log userId here
        event: 'search_performed',
        properties: {
          query: query.trim().substring(0, 100),   // truncate; NO full query if it could be PII
          resultCount: results.length,
          gameId: filters.gameId ?? null,
        },
      });
      ```
      Fire-and-forget: call `.catch(() => {})` on any async method; never block the search
      response. If `posthog-node` capture is synchronous (it is), still wrap in a try-catch.

9. **Privacy hardening** (apply across all six events):

   - Review every `properties` object: confirm zero PII fields (no `email`, `name`, `username`,
     `phone`, `ip` — PostHog auto-captures IP; override with `$ip: null` in each event if GDPR
     compliance is required).
   - Add a comment block at the top of `src/lib/posthog.ts`:
     ```ts
     // PRIVACY: Only IDs and amounts are sent as event properties.
     // Never include name, email, phone, or any other PII.
     // See docs/DECISIONS.md Step 31 for the PII policy.
     ```
   - Log this policy decision in `docs/DECISIONS.md` under Step 31.

10. **QA harness** (`scripts/qa-step31.ts`):

    Run via `npx tsx scripts/qa-step31.ts`. Follow the repo convention: `ok(label, condition)` /
    `threw(label, fn)` helpers, clearly marked test data cleaned up in a `finally` block.

    Cover:
    - **Sentry env-safe**: temporarily unset `NEXT_PUBLIC_SENTRY_DSN`; assert `Sentry.init` does
      not throw and `Sentry.captureException` returns without error (uses `enabled: false` guard).
    - **PostHog server singleton — key absent**: call `getPostHogServer()` with `NEXT_PUBLIC_POSTHOG_KEY`
      unset; assert it returns `null`.
    - **PostHog server singleton — key present**: call `getPostHogServer()` with a test key;
      assert it returns a non-null `PostHog` instance and the same instance on second call
      (singleton).
    - **`listing_viewed` — no PII**: construct a mock event properties object; assert no key
      named `email`, `name`, or `username` is present.
    - **`order_completed` — no PII**: same PII check for the `order_completed` properties.
    - **`search_performed` — query truncated**: pass a 200-char query string; assert the
      captured `query` property is ≤ 100 chars.
    - **Sentry test endpoint — auth guard**: `GET /api/debug/sentry-test` with no session returns
      403 (mock the `auth()` call or test via HTTP against the running dev server).
    - **Build smoke test**: run `npx tsc --noEmit` and assert exit code 0.

11. **Edge cases**:
    - `NEXT_PUBLIC_POSTHOG_KEY` absent: `PostHogProvider` renders `children` directly (no
      provider), `PostHogPageview` is a no-op, `getPostHogServer()` returns `null`, all six
      `.capture()` calls are no-ops via optional chaining (`?.capture()`). Zero crashes.
    - `NEXT_PUBLIC_SENTRY_DSN` absent: Sentry SDK initialises with `enabled: false`; all
      `Sentry.*` calls are no-ops. Build succeeds. Source map upload step is silently skipped.
    - PostHog `capture` inside a serverless function that exits before flush: the `flushAt: 1` +
      `flushInterval: 0` config ensures the event is sent synchronously before the function
      returns. If the network is unavailable, the SDK silently drops the event — acceptable for
      analytics.
    - Error boundary rendered on the checkout page: the fallback must NOT show any order or
      payment details (which may no longer be in a valid state). Show only the generic "Something
      went wrong" message with a reload button.
    - `search_performed` with an empty or whitespace-only query: do not capture the event
      (guard with `if (!query.trim()) return`).
    - The Sentry test endpoint (`/api/debug/sentry-test`) is ADMIN-only to prevent abuse in
      production. It MUST NOT be callable by buyers or sellers.
    - Duplicate `posthog.init` calls (e.g., React StrictMode double-invoke): the `useEffect`
      dependency array contains no reactive values after the first run, so this is safe; PostHog
      JS also guards against double-init internally.

### Rules
- **Zero PII in PostHog event properties.** IDs and integer amounts only. If in doubt, omit the
  field. Document the policy in `docs/DECISIONS.md`.
- **Env-safe everywhere.** Missing `SENTRY_AUTH_TOKEN`, `NEXT_PUBLIC_SENTRY_DSN`,
  `NEXT_PUBLIC_POSTHOG_KEY` must produce zero crashes — features degrade silently. The build must
  succeed with all four keys absent.
- **`order_completed` is server-side only.** Never fire it from the client; the server is the
  single source of truth for completed transactions.
- **Sentry `tracesSampleRate` is 0.1 in production.** Never set it to 1.0 in prod — this would
  send 100% of requests as traces and exhaust the Sentry quota rapidly.

### Report back
CLAUDE.md output format + QA CHECKLIST below.

---

## ✅ QA CHECKLIST
- [ ] `npm install posthog-js posthog-node` completed; `package.json` updated
- [ ] `withSentryConfig` wraps `next.config.ts`; build succeeds with all Sentry env vars absent
- [ ] `sentry.client.config.ts`, `sentry.server.config.ts`, `sentry.edge.config.ts` all present and correct; `tracesSampleRate: 0.1` in production
- [ ] `Sentry.setUser({ id, email })` fires after login; `Sentry.setUser(null)` fires on sign-out
- [ ] `SentryErrorBoundary` wraps listing detail page, checkout page, and dashboard layout; fallback UI is branded (dark + blue #4d7cfe, Poppins)
- [ ] `src/app/error.tsx` and `src/app/global-error.tsx` call `Sentry.captureException(error)`
- [ ] `GET /api/debug/sentry-test` returns 403 for non-admin; returns 200 + test event for admin
- [ ] Test error appears in the Sentry project dashboard after hitting the admin endpoint (manual verify)
- [ ] Sentry source maps uploaded during build (confirm in Sentry → Releases → Source Maps when `SENTRY_AUTH_TOKEN` is set)
- [ ] `PostHogProvider` wraps `<body>` in root layout; `PostHogPageview` is present inside `<Suspense>`
- [ ] Navigating between pages fires `$pageview` events in PostHog (visible in PostHog → Activity)
- [ ] `listing_viewed` fires when a listing detail page is rendered (server-side)
- [ ] `checkout_started` fires exactly once per order creation (not on retries of the same order)
- [ ] `payment_initiated` fires for both CoinGate and Razorpay providers with correct `amountMinor`
- [ ] `order_completed` fires server-side from `escrow.ts`; NOT fired from any client component
- [ ] `seller_onboarded` fires after `SellerProfile` row is created
- [ ] `search_performed` fires on marketplace search; empty/blank queries produce no event
- [ ] Zero PII fields (`email`, `name`, `username`, `phone`) in any captured event properties (verified in QA harness + PostHog event inspector)
- [ ] `NEXT_PUBLIC_POSTHOG_KEY` absent: no provider rendered, no JS errors, all six events are silent no-ops
- [ ] `NEXT_PUBLIC_SENTRY_DSN` absent: Sentry initialises with `enabled: false`; no crashes
- [ ] `scripts/qa-step31.ts` passes all checks: singleton, PII assertions, query truncation, auth guard
- [ ] Lighthouse Performance score regression < 5% compared to pre-Step-31 baseline (PostHog JS is async — confirm it does not block LCP)
- [ ] `typecheck`/`lint`/`build` pass; error boundaries and analytics provider are mobile responsive
- [ ] Step 31 ticked in `docs/ROADMAP.md`; PII policy + key decisions logged in `docs/DECISIONS.md`
- [ ] Final Status: ✅ Pass

---

## 👉 After this step
Move to **Step 32 — Security hardening** (rate limiting, CSRF hardening, CSP headers, secret
rotation checklist, and a full pre-launch security audit pass).

## 🔑 Tokens needed: **`SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT`, `NEXT_PUBLIC_SENTRY_DSN` (already from Step 09), `NEXT_PUBLIC_POSTHOG_KEY`, `NEXT_PUBLIC_POSTHOG_HOST`**
