# STEP 20 — Seller "CEO" Dashboard

> Goal: Give every seller a rich analytics cockpit at `/seller/dashboard` — revenue trends,
> listing performance, order funnel, wallet summary, and AI-powered pricing suggestions via Recharts.

---

## PROMPT (copy from here ⬇️)

You are the CTO + Senior Backend + Senior Frontend + Senior QA Engineer of GETX. Read `CLAUDE.md` +
`docs/ENGINEERING-GUARDRAILS.md` (§1, §4, §6). Work in `D:\GetX`. This is **Step 20 — Seller "CEO" Dashboard**.
Talk Hinglish. Follow the full workflow.

### Task

1. **Install Recharts** (`npm install recharts`): add `recharts` to `package.json`. Verify the
   package resolves with TypeScript types (`@types/recharts` is bundled in recharts v2+). Wrap every
   chart in a `ResponsiveContainer` so Recharts can measure its parent. Do NOT import Recharts in a
   Server Component — charts are `"use client"` wrappers only; data is fetched server-side and
   passed as props.

2. **Analytics service** (`src/server/services/seller-analytics.ts`): All functions are pure
   async TypeScript, accept `sellerId: string` and an optional `days: number` (default `30`), query
   via the Prisma singleton from `src/lib/db.ts`. No `any`. Use integer minor units throughout.
   Implement:

   - **`getRevenueSeries(sellerId, days)`** → `{ date: string; revenue: number; orders: number }[]`
     (one entry per calendar day in the window). Query `LedgerEntry` where `kind = 'SALE'` and
     `userId = sellerId` (the seller's credit rows) and `createdAt >= startDate`. Group by
     `DATE(createdAt)`. Fill gaps with zero so the chart is always continuous. Return newest-last
     (ascending by date).

   - **`getTopListings(sellerId, days)`** → `{ listingId: string; title: string; completedCount: number; revenue: number }[]`
     (top 5 by `completedCount` DESC, then `revenue` DESC as tiebreak). Join `Order` (status
     `COMPLETED`) → `Listing`. Sum `LedgerEntry` SALE credits grouped by listing. Limit 5.

   - **`getOrderFunnel(sellerId, days)`** → `{ status: string; count: number }[]` for statuses
     `PENDING | AWAITING_PAYMENT | PAID | IN_PROGRESS | DELIVERED | COMPLETED | DISPUTED |
     CANCELLED | REFUNDED` — count orders where `listing.sellerId = sellerId` and `createdAt >=
     startDate`. Return all statuses (zero if none) in the order above so the BarChart is stable.

   - **`getWalletSummary(sellerId)`** → `{ availableMinor: number; heldMinor: number; totalEarnedMinor: number; totalFeesMinor: number }`.
     Reuse `getWalletBalances(sellerId)` from `src/server/services/payouts.ts` (or equivalent) for
     `available`/`held`. Derive `totalEarnedMinor` = Σ `LedgerEntry` where `kind = 'SALE'` and
     `userId = sellerId` (all time). Derive `totalFeesMinor` = Σ `LedgerEntry` where
     `kind = 'COMMISSION'` and `userId = sellerId` (all time, absolute value). All math in integers.

   - **`getPriceBenchmark(listingId)`** → `{ avgMinor: number; minMinor: number; maxMinor: number; sampleSize: number }`.
     Find the `Listing` to read its `gameId` + `categoryId`. Query all ACTIVE listings with the same
     `gameId` + `categoryId`, excluding the target listing itself. Compute avg/min/max of
     `priceMinor`. If `sampleSize === 0` return `null` (no benchmark available).

   Wrap every function with `React.cache()` (import from `"react"`) so repeated RSC calls within
   one request are deduplicated. Never run N+1 queries — use Prisma `groupBy`, raw SQL `DATE()`, or
   a single join where needed.

3. **AI pricing Server Action** (`src/server/actions/seller-analytics.ts`): export
   `getAIPricingSuggestion(listingId: string)`. Guard: re-auth session + verify caller owns the
   listing. Fetch current listing price, benchmark (via `getPriceBenchmark`), and last-30d revenue
   series for that listing. Call `claude-haiku-4-5-20251001` via `src/lib/ai.ts` (the existing
   Anthropic client). Prompt (system + user) should include: current price in display currency,
   benchmark avg/min/max, number of completed sales in last 30d, category name. Ask for a 1-sentence
   recommendation + a suggested price range (min–max). Parse the response as plain text — no JSON
   parsing needed. If `ANTHROPIC_API_KEY` is absent or the call fails, return a graceful fallback
   string (`"AI pricing unavailable — check API key."`). Cache result in React component state
   (not persistent); each button click re-calls the action. Do NOT cache the AI response in the DB
   for this step.

4. **Dashboard page** (`src/app/(dashboard)/seller/dashboard/page.tsx`): SELLER role required
   (redirect to `/login` if not authenticated; 403 page if authenticated but not SELLER). Accept a
   `?days=7|30|90` URL search param (default `30`); validate with Zod (`z.enum(["7","30","90"])`).
   Call all analytics functions in parallel with `Promise.all` (no sequential awaiting). Structure:

   - **Stat cards row** (2×2 on mobile, 4-across on desktop): Total Earned, Available Balance, In
     Escrow (held), Total Orders. Display monetary values formatted as ₹ from minor units
     (`formatPrice` from `src/lib/utils.ts` or equivalent).

   - **Date range selector**: three buttons (7d / 30d / 90d) that navigate to `?days=X` using a
     lightweight `"use client"` `<DateRangePicker>` component. Active state highlighted with the v10
     brand blue (`#4d7cfe`).

   - **Revenue LineChart** (`src/components/seller/charts/revenue-chart.tsx`, `"use client"`):
     Recharts `<LineChart>` inside `<ResponsiveContainer width="100%" height={260}>`. X-axis =
     short date label, Y-axis = revenue in ₹ (converted from minor units). Tooltip shows date +
     revenue + order count. On mobile, wrap the chart container in `overflow-x-auto` so the chart
     can scroll horizontally rather than crush.

   - **Order Funnel BarChart** (`src/components/seller/charts/funnel-chart.tsx`, `"use client"`):
     Recharts `<BarChart>` with the same responsive + scroll pattern. Show only statuses that have
     count > 0 to reduce noise, but keep the zero-fill logic in the service so callers can choose.

   - **Top Listings table** (`src/components/seller/top-listings-table.tsx`): shadcn `<Table>`.
     Columns: Listing title (links to `/listing/[slug]`), Completed Sales, Revenue, and an
     **"AI Price" button**. Clicking the button calls `getAIPricingSuggestion` (Server Action) and
     shows the result in a `<Tooltip>` or inline collapse — no full page reload. Button shows a
     spinner while pending (`useTransition`). If benchmark is unavailable for that listing, show
     "No benchmark data" in the tooltip.

   - All data loading uses React Suspense with skeleton fallbacks (`src/components/shared/skeleton`
     or inline). Never block the whole page on a slow query — wrap each chart section in its own
     `<Suspense>` boundary.

5. **Mobile layout** (`src/app/(dashboard)/seller/dashboard/page.tsx`): stat cards use
   `grid-cols-2 gap-4` on small screens → `grid-cols-4` on `md:`. Chart containers use
   `overflow-x-auto` with a `min-w-[320px]` inner div so Recharts renders at a usable width on
   phones. Top listings table horizontally scrolls on small screens (`overflow-x-auto`). Date range
   buttons stack if needed. Test at 375px viewport.

6. **Navigation**: add a "Dashboard" link to `src/components/seller/seller-nav-links.tsx` pointing
   to `/seller/dashboard`. Make it the first item in the seller nav. Active state follows the
   existing nav pattern.

7. **QA harness** (`scripts/qa-step20.ts`): run with `npx tsx scripts/qa-step20.ts`. Use
   `ok(label, cond)` / `threw(label, fn)` helpers (see `scripts/qa-step10.ts` for the pattern).
   Test cases (use the seeded seller account from `prisma/seed.ts` or create a transient one and
   clean up in `finally`):

   - `getRevenueSeries` returns an array of length equal to `days`, all dates filled, revenue ≥ 0.
   - `getRevenueSeries` with `days=7` returns 7 entries.
   - `getTopListings` returns ≤ 5 results sorted by `completedCount` DESC.
   - `getOrderFunnel` returns entries for all 9 expected statuses.
   - `getWalletSummary` `availableMinor + heldMinor` matches ledger-derived balance.
   - `getPriceBenchmark` with a listing that has no peers returns `null`.
   - `getPriceBenchmark` with peers returns `avg >= min && avg <= max`.
   - AI mock: stub `ANTHROPIC_API_KEY` absent → action returns the fallback string gracefully.
   - Date filtering: `getRevenueSeries(sellerId, 90)` returns exactly 90 entries.
   - No N+1: ensure queries do not multiply per listing (use `console.time` or query-count log).

   Clean up any inserted test data in `finally` block.

8. **Edge cases**:
   - Seller with zero sales: all charts render empty states (not crashes); stat cards show ₹0.
   - `days` param tampered to an invalid value: Zod validation falls back to 30; no 500.
   - `ANTHROPIC_API_KEY` missing: AI button shows fallback text, page does not crash.
   - Listing deleted mid-session: `getTopListings` gracefully skips orphaned rows (left-join or
     filter `listing !== null`).
   - Benchmark with 1 peer: avg = min = max = that peer's price; `sampleSize = 1`.
   - Very large date ranges (90d with many orders): queries must complete under 2 s; add a
     composite DB index on `LedgerEntry(userId, kind, createdAt)` in a new migration if one does
     not exist.
   - Non-seller trying to access `/seller/dashboard`: redirect to appropriate error page.

### Rules

- All chart components are `"use client"`; data fetching is server-side only (Server Components or
  Server Actions). Never call analytics functions from a client component directly.
- Money in all service functions must stay in integer minor units; only convert to display currency
  at the rendering layer (`formatPrice`). Never use floats for money.
- `ANTHROPIC_API_KEY` absence must degrade gracefully — AI feature hidden or fallback message, never
  a 500 error or uncaught exception.
- No N+1 queries. Every analytics function must use a single DB round-trip (Prisma `groupBy`, raw
  aggregation, or a batched join). Verify in QA.

### Report back
CLAUDE.md output format + QA CHECKLIST below.

---

## ✅ QA CHECKLIST

- [ ] `/seller/dashboard` is SELLER-only; buyer and unauthenticated users are redirected
- [ ] Stat cards display correct values matching ledger (spot-check against DB)
- [ ] Revenue LineChart renders real data for 7d / 30d / 90d; switching date range updates all charts
- [ ] Order Funnel BarChart shows correct per-status counts; zero-count statuses handled cleanly
- [ ] Top Listings table shows ≤ 5 listings sorted by completed count DESC
- [ ] AI Price button calls `claude-haiku-4-5-20251001`, shows 1-sentence recommendation; spinner shown during fetch
- [ ] AI feature returns graceful fallback when `ANTHROPIC_API_KEY` is absent — no crash, no 500
- [ ] `getPriceBenchmark` returns `null` for a listing with no peers in same game+category
- [ ] Wallet summary `available + held` matches `getWalletBalances` output
- [ ] `getRevenueSeries` gap-fill: 30d window always returns exactly 30 data points
- [ ] Mobile (375px): stat cards 2×2 grid, charts horizontally scrollable, table scrollable
- [ ] No N+1 queries confirmed (QA harness or Prisma query log)
- [ ] New `LedgerEntry(userId, kind, createdAt)` composite index migration applied cleanly
- [ ] `scripts/qa-step20.ts` passes all assertions (run with `npx tsx scripts/qa-step20.ts`)
- [ ] `typecheck`/`lint`/`build` pass; mobile responsive
- [ ] Step 20 ticked in `docs/ROADMAP.md`; DECISIONS updated
- [ ] Final Status: ✅ Pass

---

## 👉 After this step
Step 21 — Loyalty + Referral system: referral codes, reward credits on first purchase, loyalty
tiers for repeat buyers/sellers (Bronze → Silver → Gold), integrated into the wallet ledger.

## 🔑 Tokens needed: **`ANTHROPIC_API_KEY`** (from Step 16 / AI setup).
