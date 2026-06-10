# STEP 33 — Performance (CWV, Bundle, Queries)

> Goal: Lighthouse ≥90 across all Core Web Vitals on home, marketplace, and listing pages —
> achieved via bundle reduction, DB query tuning, image/font optimisation, and ISR caching.

---

## PROMPT (copy from here ⬇️)

You are the CTO + Senior Full-Stack + Senior Performance Engineer of GETX. Read `CLAUDE.md` +
`docs/ENGINEERING-GUARDRAILS.md` (§4). Work in `D:\GetX`. This is **Step 33 — Performance**.
Talk Hinglish. Follow the full workflow.

### Task

1. **Bundle analysis and code-splitting** (`next.config.ts` / `next.config.js`):

   - Install `@next/bundle-analyzer` (`npm install --save-dev @next/bundle-analyzer`).
   - Wire the analyzer in `next.config.ts`:
     ```ts
     import withBundleAnalyzer from '@next/bundle-analyzer';
     const withAnalyzer = withBundleAnalyzer({ enabled: process.env.ANALYZE === 'true' });
     export default withAnalyzer(nextConfig);
     ```
   - Run `ANALYZE=true npm run build` and identify the **top 3 largest client-side chunks** — almost
     certainly some combination of `recharts`, `socket.io-client`, and `framer-motion`.
   - For each heavy chunk, replace static imports with `next/dynamic` + a skeleton/spinner loading
     fallback:
     - **Recharts** (used in seller CEO dashboard / analytics): dynamic-import the chart component
       with a `<Skeleton className="h-64 w-full" />` fallback; `ssr: false`.
     - **socket.io-client** (chat room): already imported inside `src/components/chat/`; confirm it
       is never in a server component. If a static import exists at the module level of any page
       component, move it behind `dynamic()`.
     - **framer-motion** (any animated UI component): wrap with `dynamic(() => import(...), { ssr: false })`
       or replace trivial animations with CSS `transition` / `@keyframes` (prefer CSS — zero bundle
       cost). Remove framer-motion entirely if it is only used for simple fade-ins.
   - After splitting, re-run `ANALYZE=true npm run build`; confirm the main client JS bundle is
     **≥15% smaller** than before (record before/after sizes in `docs/DECISIONS.md`).
   - Add `ANALYZE` to `.env.example` with value `false` and a comment explaining its purpose.

2. **DB query audit — N+1 elimination** (`src/server/services/` + Prisma schema):

   - Enable Prisma query logging in development by adding the following to `src/lib/db.ts` (guarded
     so it only activates when `process.env.NODE_ENV === 'development'`):
     ```ts
     log: ['query', 'warn', 'error']
     ```
   - Run the app locally, navigate to `/` (homepage rail), `/marketplace`, and a `/listing/[slug]`
     detail page, and collect the logged queries in the terminal.
   - **Fix N+1 on listing cards**: the marketplace fetch in `src/server/services/marketplace.ts`
     likely fetches listings first, then separately fetches `SellerProfile` for each card. Rewrite
     the query to use a single Prisma `findMany` with:
     ```ts
     include: {
       seller: { include: { sellerProfile: { select: { displayName: true, ratingAvg: true, ratingCount: true, kycStatus: true } } } },
       game: { select: { name: true, slug: true, iconUrl: true } },
       category: { select: { name: true } },
       _count: { select: { reviews: true } },
     }
     ```
     Verify that the marketplace page now issues **≤5 queries** for a full page load (target: 1
     listings query + 1 active-game filter query + ≤3 ancillary queries).
   - **Fix N+1 on order detail** (`src/server/services/orders.ts`): the order detail fetch should
     load the order + `OrderDelivery` + ledger entries + buyer + seller in one `findUnique` with
     nested `include` — no waterfall selects.
   - **Seller revenue series** (`src/server/services/marketplace.ts` or the seller analytics
     service): replace any in-memory array grouping of individual order rows with a raw Prisma
     `$queryRaw` that does the date-bucketing in SQL:
     ```sql
     SELECT date_trunc('day', "completedAt") AS day, SUM("totalMinor") AS revenue
     FROM "Order"
     WHERE "sellerId" = $1 AND "status" = 'COMPLETED'
       AND "completedAt" >= NOW() - INTERVAL '30 days'
     GROUP BY 1 ORDER BY 1;
     ```
   - After fixes, recheck logged query counts — confirm no N+1 remains.

3. **Schema index audit** (`prisma/schema.prisma`):

   - Re-read every model that participates in a `WHERE` clause in the marketplace, orders, or
     analytics queries. Ensure the following indexes exist (add any that are missing):
     - `Listing`: `@@index([gameId, status])`, `@@index([sellerId])`, `@@index([status, createdAt])`
     - `Order`: `@@index([buyerId, status])`, `@@index([sellerId, status])`, `@@index([status, completedAt])`
     - `LedgerEntry`: `@@index([userId, type])`, `@@index([orderId])`
     - `Message` / `Conversation`: `@@index([orderId])`, `@@index([buyerId])`, `@@index([sellerId])`
     - `Review`: `@@index([sellerId])`, `@@index([listingId])`
   - Generate a migration for any new indexes using the interactive-safe workflow:
     `npx prisma migrate diff --from-schema-datasource --to-schema-datamodel prisma/schema.prisma --script`
     → paste output into a hand-written migration folder
     `prisma/migrations/$(date +%Y%m%d%H%M%S)_step33_perf_indexes/migration.sql`
     → run `npx prisma migrate deploy`.
     Do NOT run `prisma migrate dev` (interactive, will hang).
   - Run `EXPLAIN ANALYZE` on the three hottest queries (marketplace `findMany`, order detail
     `findUnique`, seller revenue `$queryRaw`) against the dev Neon DB using `psql` or a DB client.
     Confirm each query uses an index scan (not a seq scan) for the main filter predicate. Paste the
     relevant `EXPLAIN ANALYZE` output excerpt into `docs/DECISIONS.md`.

4. **ISR caching strategy** (page-level `revalidate` / `unstable_cache`):

   - Apply `revalidate` in the following server components or `unstable_cache` wrappers:
     | Route / data call | `revalidate` (seconds) | Notes |
     |---|---|---|
     | Homepage listing rail | `3600` | `/` hero + featured listings |
     | Game grid (game catalog) | `300` | `/games` or homepage games section |
     | Leaderboard pages | `3600` | already set in Step 27 — verify, do not re-set |
     | Demand signals / trending | `86400` | price trend stats |
     | `/how-it-works`, `/about`, `/faq` | `false` (fully static) | `export const revalidate = false` |
     | Seller analytics dashboard | `0` (no-cache) | always real-time; add `export const revalidate = 0` |
     | Marketplace (`/marketplace`) | `300` | faceted listing grid |
     | Listing detail (`/listing/[slug]`) | `300` | individual listing page |
   - For routes that already have `revalidate` set (Step 27 leaderboards, Step 20 CEO dashboard),
     verify the value matches the table above; update only if it differs.
   - Do NOT cache any page that renders session-specific data without proper separation of static
     shell from dynamic data islands.

5. **Image optimisation** (`next/image`, Sharp, WebP conversion):

   - Audit every `<img>` tag in `src/` — replace all with `next/image`. Every `<Image>` must have
     either explicit `width` + `height` props or `fill` + a `relative`-positioned parent (prevents
     CLS). Zero exceptions.
   - Add `priority` prop to the hero image, site logo in the header, and the **first 4 listing
     cards** on the marketplace grid (above-fold LCP elements). All other images must NOT have
     `priority` (they should lazy-load).
   - Convert all PNG/JPG files in `public/` (except SVG, ICO, and placeholder images) to WebP:
     ```bash
     for f in public/**/*.{png,jpg,jpeg}; do
       npx sharp-cli --input "$f" --output "${f%.*}.webp" --format webp --quality 85
     done
     ```
     (Install `sharp-cli` as a dev dependency if not present.) Update all references in source files
     from `.png`/`.jpg` to `.webp`. Keep the originals until confirmed — delete them in a follow-up.
   - Ensure `next.config.ts` has `images.formats: ['image/avif', 'image/webp']` and
     `images.remotePatterns` covers Cloudflare R2 bucket domain(s) already used for listing images.
   - Verify Sharp is installed as a production dependency (`npm list sharp`) — Next.js image
     optimisation requires it server-side on Vercel.

6. **Font optimisation** (`src/app/layout.tsx` or wherever fonts are declared):

   - Open the root layout and locate the `next/font` declarations.
   - **Poppins**: ensure only weights `400` and `700` are loaded with `preload: true` (default).
     Remove any additional weights (500, 600, 800, etc.) unless they are demonstrably used in CSS
     (search for `font-medium`, `font-semibold`, `font-extrabold` — if found, keep `500`/`600`/`800`
     but document the reason in a code comment).
   - **JetBrains Mono** (used for prices / code blocks per Step 04): confirm `preload: false` is set.
     This font is below-the-fold; preloading it wastes bandwidth on first load.
   - **Inter** (body text): verify `subsets: ['latin']` — do not load cyrillic/greek/vietnamese
     subsets unless i18n is active (Step 23).
   - Do NOT change the font choices (v10 design is final) — only optimise load parameters.
   - After changes, confirm in the browser DevTools Network tab that no more than 2 font WOFF2
     files are fetched on the initial page load for `/`.

7. **Core Web Vitals targets** (measured in QA — step 9):

   - **LCP ≤ 2.5 s** on home + marketplace + listing detail (measured with Lighthouse headless in
     the QA harness).
   - **CLS = 0** (or < 0.1) — all images sized, no layout shifts from font swap (use
     `font-display: swap` — `next/font` sets this by default).
   - **INP ≤ 200 ms** — avoid long tasks on the main thread. If recharts chart animations fire on
     mount, defer them with `useEffect` + `requestAnimationFrame`. Debounce marketplace filter
     inputs (≥300 ms) to prevent rapid consecutive re-renders.

8. **scripts/qa-step33.ts** — Lighthouse CI + N+1 assertion harness:

   - Create `scripts/qa-step33.ts`. Add a `dev:start` script or rely on a locally running dev
     server (document clearly: "Run `npm run dev` in a separate terminal before executing this
     harness").
   - Use `puppeteer` + `lighthouse` (install both as dev dependencies) to run Lighthouse against:
     - `http://localhost:3000/` (home)
     - `http://localhost:3000/marketplace`
     - `http://localhost:3000/listing/<any-real-slug>` (seed one listing or use a known slug from
       the dev DB)
   - Assert for each URL:
     - `categories.performance.score >= 0.9`
     - `audits['largest-contentful-paint'].numericValue <= 2500`
     - `audits['cumulative-layout-shift'].numericValue <= 0.1`
     - `audits['total-blocking-time'].numericValue <= 300` (proxy for INP)
   - Use the repo's `ok()` / `threw()` helper pattern; print a summary table of scores; exit
     non-zero if any assertion fails.
   - **N+1 assertion**: instrument a lightweight query counter by temporarily setting the Prisma
     `log: ['query']` event emitter in `src/lib/db.ts` when `QA_QUERY_COUNT=1` env var is set;
     expose a GET endpoint `GET /api/internal/query-count` that returns `{ count: N }` (reset on
     each request). After fetching `/marketplace`, assert `count <= 5`.
   - Clean up: close the Puppeteer browser instance in a `finally` block.
   - Add `puppeteer` and `lighthouse` to `devDependencies`; add a `"qa:perf"` npm script:
     `"qa:perf": "npx tsx scripts/qa-step33.ts"`.

9. **Edge cases**:
   - Dynamic-imported components that throw during load (network error): wrap each `dynamic()` call
     with an `error` prop fallback — a simple "Failed to load — refresh" message, not a blank space.
   - `ANALYZE=true` build in CI: ensure `@next/bundle-analyzer` is installed in `devDependencies`
     and the CI pipeline does not set `ANALYZE=true` (it opens a browser tab, breaking headless CI).
     Add a comment in `next.config.ts` warning about this.
   - Sharp not found on Vercel: `sharp` must be in `dependencies` (not `devDependencies`) because
     Vercel's build prunes dev deps. Verify with `npm list sharp --depth=0`.
   - WebP conversion for images referenced via Cloudflare R2 URLs: those are already served through
     Next.js image optimisation at runtime — no manual conversion needed. Only convert static files
     in `public/`.
   - ISR + auth: pages with `revalidate > 0` must not render per-user data in their static shell.
     If a page conditionally shows login state (e.g., a "Buy Now" button vs. "Login to buy"), use a
     client component island that reads the session client-side — never in the statically cached RSC.
   - Lighthouse scores in CI vs. local may differ by ~5 points due to CPU throttling simulation.
     Target ≥ 90 in CI; document if a page consistently scores 88–89 and cannot be improved without
     architectural changes — log in `docs/DECISIONS.md`.

### Rules
- Every `<img>` replaced with `next/image` with correct `width`/`height`/`fill` — no CLS from
  unsized images. Zero exceptions. This is a non-negotiable a11y + CWV requirement.
- Never cache pages that contain per-user session data in their RSC shell. Separate static shell
  from dynamic client islands. Violating this can leak one user's data to another (ISR poisoning).
- `sharp` must be in `dependencies`, not `devDependencies`. Image optimisation on Vercel fails
  silently without it, causing massive LCP regressions.
- Bundle savings must be measurable: record before/after JS sizes in `docs/DECISIONS.md` and confirm
  ≥15% reduction in total first-load JS before marking this step done.

### Report back
CLAUDE.md output format + QA CHECKLIST below.

---

## ✅ QA CHECKLIST
- [ ] `ANALYZE=true npm run build` runs without error; bundle-analyzer HTML report opens and shows top chunks
- [ ] Recharts, socket.io-client, and/or framer-motion are dynamic-imported; their chunks are absent from the main initial JS bundle in the analyzer
- [ ] First-load JS total size is ≥15% smaller than pre-optimization (before/after sizes recorded in `docs/DECISIONS.md`)
- [ ] Marketplace page loads issue ≤5 DB queries in development (verified via Prisma query logs)
- [ ] No N+1 on listing cards — seller data loaded in a single `include`, not per-card queries
- [ ] Order detail page loads in a single `findUnique` with nested includes — no waterfall selects
- [ ] Seller revenue series computed via a single raw SQL `GROUP BY` query — no in-memory grouping of individual rows
- [ ] `EXPLAIN ANALYZE` confirms index scans (not seq scans) for marketplace, order detail, and seller revenue queries; output excerpts in `docs/DECISIONS.md`
- [ ] New Prisma indexes deployed via `migrate deploy`; migration folder exists in `prisma/migrations/`
- [ ] Homepage rail has `revalidate: 3600`; game grid has `revalidate: 300`; `/how-it-works`, `/about`, `/faq` have `revalidate: false`; seller analytics dashboard has `revalidate: 0`
- [ ] ISR headers visible in production-like build (`Cache-Control: s-maxage=300, stale-while-revalidate`) on marketplace response
- [ ] All `<img>` tags replaced with `next/image`; every `<Image>` has `width`+`height` or `fill` with positioned parent — zero unsized images
- [ ] Hero image and first 4 listing cards have `priority` prop; all below-fold images do NOT have `priority`
- [ ] Static `public/` PNG/JPG files converted to WebP; source references updated accordingly
- [ ] `next.config.ts` has `images.formats: ['image/avif', 'image/webp']`; `sharp` is in `dependencies`
- [ ] Poppins font loads only weights 400+700 with `preload: true`; JetBrains Mono has `preload: false`; no more than 2 font WOFF2 files fetched on `/` initial load (verified in DevTools Network)
- [ ] Lighthouse CLI (via `scripts/qa-step33.ts`) reports `performance ≥ 0.9` on home, marketplace, and a listing detail page
- [ ] LCP ≤ 2.5 s, CLS ≤ 0.1, TBT ≤ 300 ms on all three pages per Lighthouse output
- [ ] `scripts/qa-step33.ts` N+1 assertion passes: marketplace query count ≤ 5
- [ ] `"qa:perf": "npx tsx scripts/qa-step33.ts"` script runs to completion (requires `npm run dev` running); all assertions pass
- [ ] Dynamic-import error fallbacks render correctly (test by temporarily throwing inside the dynamic component)
- [ ] No per-user data leaks from ISR-cached pages (verify: log out, visit a previously cached page — no session-specific content in the static shell)
- [ ] `typecheck`/`lint`/`build` pass; all new and modified pages are mobile responsive; no `any` types introduced
- [ ] Step 33 ticked in `docs/ROADMAP.md`; before/after bundle sizes, `EXPLAIN ANALYZE` excerpts, and ISR revalidation decisions logged in `docs/DECISIONS.md`
- [ ] Final Status: ✅ Pass

---

## 👉 After this step
Move to **Step 34 — Testing** (unit tests for services + ledger logic with Vitest, integration
tests for critical API routes, and an E2E Playwright smoke suite covering the buyer purchase flow
and seller delivery flow).

## 🔑 Tokens needed: **None**
