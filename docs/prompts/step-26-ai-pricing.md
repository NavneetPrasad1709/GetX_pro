# STEP 26 — AI Demand Forecast + Pricing Assistant

> Goal: Give sellers an AI-powered market pulse — 7-day demand forecasts and optimal price
> recommendations per game/category — backed by a daily signal aggregation cron and a clean
> admin analytics dashboard.

---

## PROMPT (copy from here ⬇️)

You are the CTO + Senior Backend + Senior Full-Stack Engineer of GETX. Read `CLAUDE.md` +
`docs/ENGINEERING-GUARDRAILS.md` (§1, §4, §5, §7) + `docs/FEES.md`. Work in `D:\GetX`. This is
**Step 26 — AI Demand Forecast + Pricing Assistant**. Talk Hinglish. Follow the full workflow.

### Task

1. **Database models + migration** (`prisma/schema.prisma` + new migration folder
   `prisma/migrations/20260609120000_step26_demand_signals/`):

   - **`DemandSignal`** — one row per (game, category, date); upserted daily by the cron:
     ```
     id               String       @id @default(cuid())
     gameId           String
     game             Game         @relation(fields: [gameId], references: [id])
     categoryKind     CategoryKind                      // reuse existing enum
     date             DateTime                          // midnight UTC of the aggregated day
     orderCount       Int          @default(0)
     avgPriceMinor    Int          @default(0)          // integer minor units (paisa/cents)
     searchCount      Int          @default(0)          // incremented fire-and-forget
     createdAt        DateTime     @default(now())
     updatedAt        DateTime     @updatedAt
     @@unique([gameId, categoryKind, date])
     @@index([gameId, date])
     @@index([categoryKind, date])
     ```

   - **`SearchLog`** — append-only fire-and-forget log of marketplace search queries:
     ```
     id         String    @id @default(cuid())
     query      String
     gameId     String?
     createdAt  DateTime  @default(now())
     @@index([gameId, createdAt])
     @@index([createdAt])
     ```

   - Generate the migration using the interactive-safe workflow:
     `npx prisma migrate diff --from-schema-datasource --to-schema-datamodel prisma/schema.prisma --script`
     → paste SQL into the hand-written migration file → run `npx prisma migrate deploy`.
     Do NOT run `prisma migrate dev` (interactive, will hang).

2. **Search logging** (`src/server/services/marketplace.ts` — existing search/listing-query path):

   - After returning search results to the caller, fire-and-forget a `SearchLog` insert:
     ```ts
     // Non-blocking — never await this
     db.searchLog.create({ data: { query, gameId: gameId ?? null } }).catch(() => {});
     ```
   - This must NEVER block the search response or throw to the caller. Wrap in `.catch(() => {})`.
   - Do not log empty queries (trim + length check).
   - No PII — only the raw query string and optional gameId. Never log userId.

3. **Daily demand-signal aggregation cron** (`src/app/api/cron/demand-signals/route.ts`):

   - Schedule: `0 20 * * *` UTC (= 2 AM IST) in `vercel.json` under `"crons"`.
   - Auth: fail-closed Bearer token check (`Authorization: Bearer <CRON_SECRET>`). Return 401 for
     any missing/wrong token. Never skip this check.
   - Logic (inside a single `db.$transaction`):
     a. Compute `yesterday` = start of the previous UTC calendar day (00:00:00 UTC).
     b. Aggregate all `Order` rows where `status = 'COMPLETED'` and
        `updatedAt >= yesterday` and `updatedAt < today` — group by
        `(listing.gameId, listing.category.kind)`.
     c. For each group: `orderCount = COUNT(*)`, `avgPriceMinor = ROUND(AVG(subtotalMinor))`.
     d. Upsert into `DemandSignal` using `@@unique([gameId, categoryKind, date])`:
        ```ts
        await db.demandSignal.upsert({
          where: { gameId_categoryKind_date: { gameId, categoryKind, date: yesterday } },
          create: { gameId, categoryKind, date: yesterday, orderCount, avgPriceMinor },
          update: { orderCount, avgPriceMinor },
        });
        ```
     e. Also aggregate `SearchLog` rows from yesterday: group by `(gameId, query)`, then
        update `DemandSignal.searchCount` to `SUM(count)` for each matching (gameId, date) row.
        Use a raw `UPDATE … SET searchCount = (SELECT COUNT(*) FROM "SearchLog" WHERE …)` or a
        separate upsert pass — your choice, but keep it in the same transaction.
   - Log summary: `{ date: yesterday, signalsUpserted: N }` to `console.log` (picked up by Vercel
     logs / Sentry breadcrumbs).
   - Fail-closed: any uncaught error returns 500 and is captured by Sentry
     (`Sentry.captureException`). Never swallow errors silently.
   - Idempotent: running twice for the same day must produce identical results (upsert guarantees
     this).

4. **Demand forecast service** (`src/server/services/demand-forecast.ts`):

   - Use the `claude-haiku-4-5-20251001` model for ALL AI calls in this service (fast + cheap;
     forecasts are non-critical inference, not hard reasoning).
   - Import Anthropic client from `src/lib/ai.ts` (existing singleton). Degrade gracefully when
     `ANTHROPIC_API_KEY` is absent: return `null` / a "unavailable" payload; never crash.

   a. **`getMarketTrends(gameId: string, days = 30): Promise<DemandSignal[]>`**
      - Fetch the last `days` `DemandSignal` rows for `gameId`, ordered `date ASC`.
      - Returns raw rows (used by the AI call and the admin chart).

   b. **`getDemandForecast(gameId: string, categoryKind: CategoryKind): Promise<DemandForecastResult | null>`**
      ```ts
      type DemandLevel = 'HIGH' | 'MEDIUM' | 'LOW';
      type DemandForecastResult = {
        level: DemandLevel;
        reasoning: string;          // 1–2 sentences, shown in the UI
        sevenDayOutlook: string;    // short human-readable outlook
        dataPoints: number;         // how many signals were used
      };
      ```
      - Fetch the last 30 `DemandSignal` rows for `(gameId, categoryKind)`.
      - If `dataPoints < 3`: return `{ level: 'MEDIUM', reasoning: 'Insufficient data for a confident forecast.', sevenDayOutlook: 'Not enough historical data yet.', dataPoints }` without calling the AI.
      - Otherwise, build a compact JSON prompt (< 800 tokens) containing the signal array:
        `[{ date, orderCount, avgPriceMinor, searchCount }, ...]` and ask Claude Haiku to return
        **only** a JSON object matching `DemandForecastResult` (no markdown, no prose outside JSON).
      - Parse with `JSON.parse`; validate the shape with Zod:
        ```ts
        const DemandForecastSchema = z.object({
          level: z.enum(['HIGH', 'MEDIUM', 'LOW']),
          reasoning: z.string().max(300),
          sevenDayOutlook: z.string().max(300),
          dataPoints: z.number().int().nonneg(),
        });
        ```
      - On any AI error or Zod parse failure: log to Sentry, return `null` (UI shows a fallback
        "Forecast unavailable" pill). Never throw to the caller.
      - Cache result in-memory (Map with `${gameId}:${categoryKind}` key, TTL 1 hour) to avoid
        hammering the AI on every page load. Use a simple `{ value, expiresAt }` wrapper.

   c. **`getPricingRecommendation(listingId: string): Promise<PricingRecommendation | null>`**
      ```ts
      type PriceAction = 'RAISE' | 'LOWER' | 'KEEP';
      type PricingRecommendation = {
        action: PriceAction;
        suggestedPriceMinor: number;   // integer minor units
        reason: string;                // 1–2 sentences
        confidenceLabel: 'HIGH' | 'MEDIUM' | 'LOW';
      };
      ```
      - Fetch the listing (including `priceMinor`, `game.id`, `category.kind`) via Prisma. Return
        `null` if the listing does not exist or is not owned by a seller.
      - Fetch the last 30 `DemandSignal` rows for `(listing.gameId, listing.category.kind)`.
      - If `signals.length < 3`: return `{ action: 'KEEP', suggestedPriceMinor: listing.priceMinor, reason: 'Insufficient market data.', confidenceLabel: 'LOW' }`.
      - Build a prompt that includes: listing's current `priceMinor`, the 30 signals, and an
        instruction to respond with **only** a JSON object matching `PricingRecommendation`. Zod-
        validate the response.
      - `suggestedPriceMinor` must be a positive integer; if the AI returns a float, `Math.round`
        it. If it returns a value ≤ 0, clamp to the listing's current price and set action `KEEP`.
      - Same 1-hour in-memory cache keyed by `listingId`. Same Sentry + null-fallback on error.

5. **Seller dashboard — "Market Pulse" widget**
   (`src/app/(dashboard)/seller/listings/page.tsx` or the existing seller listings route;
   also visible on `src/app/(dashboard)/seller/page.tsx` summary card):

   - Add a **"Market Pulse"** section to the seller listings page (above the listings table).
   - For each game the seller has active listings in, show a `DemandForecastPill` component:
     - Pill colours: HIGH = green (`bg-green-500/20 text-green-400`), MEDIUM = yellow, LOW = red.
     - Display `level` label + truncated `reasoning` (max 120 chars, "… show more" toggle).
     - Use `getDemandForecast` called in a server component with `React.cache` (one call per
       unique `(gameId, categoryKind)` per request).
     - If forecast is `null`, show a neutral grey "Forecast unavailable" pill — never crash.

   - Add a **"Price Optimizer"** button (icon button, `Sparkles` icon from lucide-react) beside each
     listing row in the listings table.
     - On click, open a Sheet/Dialog (client component) that calls a new Server Action
       `src/server/actions/demand-forecast.ts → getPricingRecommendationAction(listingId)`.
     - Display: action badge (RAISE/LOWER/KEEP with colour), `reason`, suggested price formatted
       as `₹X.XX` (or USD if `game.currency !== 'INR'`).
     - **"Apply"** button pre-fills the listing edit form's price field with `suggestedPriceMinor`
       (convert to major units for the input). The seller still clicks Save to confirm — never
       auto-apply.
     - If recommendation is `null`, show "Pricing data unavailable right now."
     - The Server Action must re-verify that the listing belongs to the calling user's seller
       profile before returning data (`auth()` + ownership check).

6. **Admin analytics page** (`src/app/admin/analytics/page.tsx`):

   - ADMIN-only (role check in the server component; redirect to `/` if not ADMIN).
   - Four sections, all computed server-side from `DemandSignal` + `SearchLog`:

   a. **GMV trend** — last 30 days total `orderCount × avgPriceMinor` per day, displayed as a
      simple HTML/Tailwind sparkline table (no charting library at MVP; a small `<table>` with
      relative bar-width cells is fine) or a `recharts` `LineChart` if already in the bundle.

   b. **Top games by revenue** — `SUM(orderCount * avgPriceMinor)` grouped by `gameId`, last 30d,
      top 5. Show game name + total GMV formatted as ₹.

   c. **Top categories** — same aggregation grouped by `categoryKind`, last 30d, top 5.

   d. **Trending search terms** — from `SearchLog`, last 7 days: `GROUP BY query ORDER BY COUNT(*) DESC LIMIT 20`.
      Display as a tag cloud (flex-wrap of pills) or a simple ranked list.

   - All DB queries run directly in the server component (no separate service file needed for this
     page; keep it co-located). Use Prisma `groupBy` and `_sum` / `_count` aggregations.
   - Add a link to this page in the existing admin sidebar/nav (`src/components/layout/` admin nav).

7. **`vercel.json` cron entry** — add to the `"crons"` array:
   ```json
   { "path": "/api/cron/demand-signals", "schedule": "0 20 * * *" }
   ```
   (20:00 UTC = 01:30 IST next day ≈ 2 AM IST; adjust to `30 20 * * *` for exactly 02:00 IST.)
   Ensure the existing cron entries (escrow auto-release, trust score) are not disturbed.

8. **QA harness** (`scripts/qa-step26.ts`):

   Run via `npx tsx scripts/qa-step26.ts` against the real dev DB. Follow the repo convention:
   `ok(label, condition)` / `threw(label, fn)` helpers, clearly marked test data cleaned up in a
   `finally` block.

   Cover:
   - Insert synthetic `Order` rows (COMPLETED, yesterday) for two games × two categories; run the
     cron handler logic directly (import and call the aggregation function, not via HTTP); assert
     `DemandSignal` rows exist with correct `orderCount` and `avgPriceMinor`.
   - Run the cron logic again for the same day; assert row counts did not double (idempotent upsert).
   - Call `getDemandForecast` with `dataPoints < 3`; assert it returns the low-data fallback without
     calling the AI.
   - Call `getDemandForecast` with ≥ 3 signals; assert the result is non-null, `level` is one of
     `HIGH|MEDIUM|LOW`, and `reasoning` is a non-empty string (real AI call — needs
     `ANTHROPIC_API_KEY` in `.env`).
   - Call `getPricingRecommendation` with a valid listingId (seed one); assert result shape passes
     Zod validation and `suggestedPriceMinor > 0`.
   - Log a `SearchLog` entry and assert it does not throw and the row is present in DB.
   - Assert that a search with an empty/blank query does NOT create a `SearchLog` row.

9. **Edge cases**:
   - `ANTHROPIC_API_KEY` absent: `getDemandForecast` and `getPricingRecommendation` return `null`;
     UI shows fallback pills; cron and search logging are unaffected.
   - Cron runs on a day with zero completed orders: upsert creates rows with `orderCount = 0`;
     subsequent runs are still idempotent.
   - AI returns malformed JSON (not parseable or fails Zod): log to Sentry, return `null`, never
     surface a 500 to the seller.
   - `suggestedPriceMinor` from AI is a float or negative: `Math.round` + clamp to current price.
   - Very long query string in `SearchLog`: truncate to 500 chars before insert.
   - Admin analytics page with no signals yet (fresh DB): render empty-state placeholders, no
     crashes.
   - Prisma `groupBy` on empty tables returns `[]`, not null — handle gracefully.

### Rules
- All AI calls use `claude-haiku-4-5-20251001` (fast + cheap for forecasts). Never use Opus or
  Sonnet here unless explicitly changed in a future step.
- `SearchLog` inserts are fire-and-forget: never `await` them, always `.catch(() => {})`. A search
  must complete in ≤ 200 ms regardless of DB state.
- Cron endpoint is fail-closed: always verify `Authorization: Bearer <CRON_SECRET>` before running
  any DB work. Return 401 immediately on failure.
- `suggestedPriceMinor` is advisory only — the seller must explicitly click Save. Never auto-update
  a listing's price without seller confirmation.

### Report back
CLAUDE.md output format + QA CHECKLIST below.

---

## ✅ QA CHECKLIST
- [ ] `DemandSignal` and `SearchLog` tables created by migration; `npx prisma migrate deploy` succeeds
- [ ] Cron `POST /api/cron/demand-signals` returns 401 with wrong/missing Bearer token
- [ ] Cron aggregates yesterday's COMPLETED orders into `DemandSignal` rows with correct `orderCount` and `avgPriceMinor`
- [ ] Running the cron twice for the same date produces identical row counts (idempotent upsert)
- [ ] `getDemandForecast` with < 3 data points returns low-data fallback object (no AI call made)
- [ ] `getDemandForecast` with ≥ 3 signals calls Claude Haiku and returns a valid `DemandForecastResult` (level + reasoning non-empty)
- [ ] `getDemandForecast` Zod schema rejects a malformed AI response; function returns `null` (no 500)
- [ ] `getPricingRecommendation` returns valid JSON with `action`, `suggestedPriceMinor > 0`, and `reason`
- [ ] `getPricingRecommendation` with float AI output: `suggestedPriceMinor` is rounded to integer
- [ ] Seller listings page shows "Market Pulse" forecast pills per game; HIGH/MEDIUM/LOW colour codes correct
- [ ] "Price Optimizer" button opens Sheet with recommendation; "Apply" pre-fills edit form price field
- [ ] Server Action for pricing recommendation rejects requests for listings not owned by the caller
- [ ] Marketplace search logs a `SearchLog` row fire-and-forget; search response time is not visibly impacted
- [ ] Empty/blank search query does NOT insert a `SearchLog` row
- [ ] Admin `/admin/analytics` page is ADMIN-only (buyer/seller redirected)
- [ ] Admin analytics: GMV trend, top games, top categories, trending terms all render (with data or empty-state)
- [ ] `vercel.json` cron entry for `demand-signals` added; existing cron entries intact
- [ ] `ANTHROPIC_API_KEY` absent: forecast pills show "Forecast unavailable"; no crashes anywhere
- [ ] `scripts/qa-step26.ts` passes all checks (aggregation, idempotency, forecast shape, pricing Zod, search-log non-blocking)
- [ ] `typecheck`/`lint`/`build` pass; seller dashboard and admin analytics pages are mobile responsive
- [ ] Step 26 ticked in `docs/ROADMAP.md`; key choices logged in `docs/DECISIONS.md`
- [ ] Final Status: ✅ Pass

---

## 👉 After this step
Move to **Step 27 — Community** (seller reputation feed, buyer reviews aggregation, public seller
profiles, and community-driven trust signals).

## 🔑 Tokens needed: **`ANTHROPIC_API_KEY`** (already present from Step 16+)
