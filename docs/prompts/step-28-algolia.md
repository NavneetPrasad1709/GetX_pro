# STEP 28 — Algolia Search Upgrade

> Goal: Replace Postgres ILIKE search with Algolia — fast, typo-tolerant, faceted, sub-100ms.
> Buyers get instant search with live facet counts; Postgres remains a zero-config fallback.

---

## PROMPT (copy from here ⬇️)

You are the CTO + Senior Backend + Senior Frontend Engineer of GETX. Read `CLAUDE.md` +
`docs/ENGINEERING-GUARDRAILS.md` (§1, §4, §5, §7). Work in `D:\GetX`. This is **Step 28 — Algolia Search Upgrade**.
Talk Hinglish. Follow the full workflow.

### Task

1. **Install & configure Algolia**
   - `npm install algoliasearch @algolia/client-search` in the root Next.js project.
   - Add the following keys to `.env.example` (keys only, no values) and document in
     `docs/DECISIONS.md` with the rationale (speed, typo tolerance, facets vs. ILIKE):
     ```
     ALGOLIA_APP_ID=          # Server + client (non-secret app identifier)
     ALGOLIA_ADMIN_KEY=       # Server-only — NEVER expose to the browser
     NEXT_PUBLIC_ALGOLIA_SEARCH_KEY=  # Public search-only key (safe to ship to client)
     ```
   - Create `src/lib/algolia.ts`:
     - Export `getAlgoliaAdminClient()`: returns an Algolia `SearchClient` initialised with
       `ALGOLIA_APP_ID` + `ALGOLIA_ADMIN_KEY`, or `null` when either key is absent.
       **Server-only** — never import this in a Client Component or in code that runs in the browser.
     - Export `ALGOLIA_INDEX_NAME = "getx_listings"` as a constant.
     - Export `isAlgoliaConfigured(): boolean` — returns `true` only when both
       `ALGOLIA_APP_ID` and `NEXT_PUBLIC_ALGOLIA_SEARCH_KEY` are set. Calling code uses this
       to decide whether to render the Algolia UI or fall back to Postgres.
   - Every Algolia call must be wrapped in `try/catch`. If Algolia is unavailable or keys are
     absent, fall back to the existing Postgres path — never crash, never surface a 500.

2. **Index schema — `getx_listings`**
   - Each Algolia record must include exactly these fields (map from Prisma models):
     ```ts
     {
       objectID: string          // listing.id (Algolia's required primary key)
       title: string
       description: string       // truncated to first 200 characters
       gameSlug: string
       gameName: string
       categoryKind: string      // e.g. "ACCOUNT", "ITEM", "CURRENCY", "GOLD", "BOOST"
       categorySlug: string
       priceMinor: number        // integer minor units (paise / cents)
       currency: string          // "INR" | "USD"
       type: string              // listing type (maps to category.kind)
       sellerUsername: string
       sellerTrustScore: number
       sellerRatingAvg: number
       deliveryType: string      // "MANUAL" | "INSTANT"
       status: string            // only "ACTIVE" listings reach the index
       createdAt: number         // Unix timestamp (seconds) for date-range filtering
     }
     ```
   - Configure index settings via `getAlgoliaAdminClient().initIndex(ALGOLIA_INDEX_NAME).setSettings()`
     inside a one-off setup function `src/scripts/algolia-setup-index.ts` (run manually once per env):
     - `searchableAttributes`: `["title", "description", "gameName", "sellerUsername"]`
     - `attributesForFaceting`: `["filterOnly(status)", "gameName", "gameSlug", "categoryKind",
       "currency", "deliveryType"]` — `status` is `filterOnly` (always filter to ACTIVE, never
       expose as user-facing facet).
     - `customRanking`: `["desc(sellerTrustScore)", "desc(sellerRatingAvg)"]`
     - `typoTolerance`: `true` (default; confirm it is not disabled)
     - Document that `algolia-setup-index.ts` must be run with `npx tsx src/scripts/algolia-setup-index.ts`
       after provisioning a new Algolia app. Add this to `docs/DECISIONS.md`.

3. **Search sync service** (`src/server/services/search-sync.ts`)
   - `syncListingToAlgolia(listingId: string): Promise<void>`
     - Fetches the listing from Postgres via the Prisma singleton (`src/lib/db.ts`), including
       `category`, `seller.user` (for `sellerUsername`), and `seller` (for `trustScore`,
       `ratingAvg`).
     - If `listing.status === "ACTIVE"`: upsert the Algolia record using
       `index.saveObject(record)`.
     - If `listing.status !== "ACTIVE"` (DRAFT, PAUSED, SOLD, REMOVED): delete from the index
       using `index.deleteObject(listingId)` — non-active listings must not appear in search.
     - If Algolia keys are absent or the client returns null: log a `console.warn` and return
       silently — never throw, never block the caller.
     - Wrap the entire function body in `try/catch`; log errors with `console.error`; never
       propagate.
   - `bulkSyncAllListings(): Promise<{ synced: number; deleted: number; errors: number }>`
     - Fetches all listings from Postgres in batches of 1 000 using Prisma `skip`/`take` (cursor
       pagination preferred if listing volume is large).
     - Separates ACTIVE listings (upsert via `index.saveObjects`) from non-ACTIVE listings
       (delete via `index.deleteObjects`).
     - Returns a summary object with counts.
     - Wraps each batch in `try/catch`; increments `errors` counter on failure; never aborts
       the full run due to a single batch error.
   - Wire `syncListingToAlgolia` into existing services (fire-and-forget with
     `void syncListingToAlgolia(id).catch(console.error)` — never `await` in the critical path):
     - `src/server/actions/listings.ts` (or wherever `createListing` lives): call after the
       listing is persisted and status is set.
     - `src/server/actions/listings.ts` `updateListing`: call after a successful update.
     - `src/server/services/escrow.ts` `setListingStatus` (or whichever service/action changes
       `Listing.status`): call after the status transition so sold/removed listings are deleted
       from the index immediately.
     - If any of these call sites do not yet exist under those exact names, locate the real
       functions by reading the files — do not assume paths.

4. **Nightly safety-net cron** (`src/app/api/cron/algolia-sync/route.ts`)
   - `GET` handler, protected by `Authorization: Bearer CRON_SECRET` (fail-closed: 401 if header
     is absent or wrong — same pattern as `/api/cron/auto-release`).
   - Calls `bulkSyncAllListings()`, logs the summary, returns `{ ok: true, ...summary }`.
   - Add the cron schedule to `vercel.json`:
     ```json
     { "path": "/api/cron/algolia-sync", "schedule": "0 3 * * *" }
     ```
     (runs at 03:00 UTC daily — low-traffic window).
   - Degrade gracefully: if `ALGOLIA_APP_ID` / `ALGOLIA_ADMIN_KEY` are absent, return
     `{ ok: true, skipped: "algolia not configured" }` with status 200 — no crash.

5. **Replace Postgres search in `marketplace.ts` with Algolia**
   - Read `src/server/services/marketplace.ts` before editing. Identify the current
     `getListings(params)` function (or equivalent) that builds a Prisma `WHERE` clause from URL
     params.
   - **Keep the URL param contract identical** (`q`, `game`, `type`, `min`, `max`, `sort`,
     `page`) — no page or link changes.
   - New logic inside `getListings`:
     1. If `isAlgoliaConfigured()` is `false` → run the existing Prisma ILIKE path unchanged.
     2. If `isAlgoliaConfigured()` is `true`:
        - Build Algolia query: `query = params.q ?? ""`.
        - Build `filters` string (Algolia filter DSL):
          - Always add `status:ACTIVE`.
          - If `params.game` is set: `AND gameSlug:${params.game}`.
          - If `params.type` is set: `AND categoryKind:${params.type}`.
          - If `params.min` or `params.max` are set: `AND priceMinor >= ${min} AND priceMinor <= ${max}`.
        - Map `params.sort` to Algolia replica index names (create replicas for price_asc /
          price_desc / newest in the setup script). Default to the main index (trust/rating ranking).
        - Set `facets: ["gameName", "categoryKind", "currency", "deliveryType"]`.
        - Set `page` (0-indexed: `params.page - 1`), `hitsPerPage: 20`.
        - Call `index.search(query, { filters, facets, page, hitsPerPage, ... })`.
        - Map Algolia hits back to the shape the existing UI components expect (same fields as
          the Prisma result). Keep `priceMinor` as-is (integer minor units).
        - Return `{ listings, total, facets, page, totalPages }`.
        - On any Algolia error: `console.error`, fall back to the Prisma path, return its result.
   - Do not change the return type signature visible to page components — the UI must be unaware
     of which backend served the results.

6. **Instant search — client filter bar**
   - Create `src/components/marketplace/instant-search-bar.tsx` as a **Client Component**
     (`"use client"`).
   - Uses `NEXT_PUBLIC_ALGOLIA_SEARCH_KEY` and `NEXT_PUBLIC_ALGOLIA_APP_ID` (add a public alias
     for APP_ID in `.env.example` if needed: `NEXT_PUBLIC_ALGOLIA_APP_ID=`).
   - Uses `algoliasearch` initialised with the public search-only key — **never** the admin key.
   - On each keystroke: debounced 350 ms with `useCallback` + `setTimeout`/`clearTimeout` (no
     extra debounce library).
   - Calls `index.search(query, { filters: "status:ACTIVE", facets: [...], hitsPerPage: 5 })`
     directly from the browser (no server round-trip for the live suggestions).
   - Renders a floating suggestion list (shadcn `Popover` or a plain `div` with `z-50` overlay)
     showing up to 5 hits with title, game name, and price.
   - Clicking a suggestion navigates to `/listing/${hit.objectID}` (or the listing slug if
     available in the hit).
   - If `NEXT_PUBLIC_ALGOLIA_SEARCH_KEY` is absent at runtime: render the existing
     `<input type="search" />` with server-side form submission unchanged — no JS error, no
     missing UI.
   - Mount `InstantSearchBar` in the existing marketplace filter bar
     (`src/app/(shop)/listing/[slug]/page.tsx` or the marketplace page component — locate the
     real file) replacing or wrapping the existing search input.

7. **Facets with counts**
   - In the marketplace page (`src/app/(shop)/` — locate the actual browse/listing-list page),
     read the `facets` returned by `getListings` and render them as a filter sidebar or filter
     chips.
   - Display format: `"Pokemon GO (42)"`, `"Currency (23)"`, `"Instant Delivery (17)"`.
   - Each facet chip/checkbox updates the URL param (e.g., `?game=pokemon-go`) via
     `router.push` — no full page reload on the server result path, shallow push on the Algolia
     path.
   - If `facets` is absent (Postgres fallback): hide the facet counts but keep the filter labels
     — UI degrades gracefully.

8. **QA harness** (`scripts/qa-step28.ts`)
   - Follow the repo convention: `npx tsx scripts/qa-step28.ts`, real services against the dev
     DB and Algolia sandbox index, `ok(label)` / `threw(label, fn)` helpers, test data cleaned
     up in `finally`.
   - Test cases to cover:
     - **Sync on create**: call `syncListingToAlgolia` after inserting a test ACTIVE listing →
       verify the record appears in Algolia via `index.getObject(listingId)`.
     - **Sync on update**: update the listing title → call sync → fetch from Algolia → assert
       new title is present.
     - **Sync on status change to non-ACTIVE**: set listing status to `SOLD` → call sync →
       assert `index.getObject` throws a `404`-type error (object not found).
     - **Typo tolerance**: search `"pokmon"` (missing 'e') → assert at least one hit with
       `gameName` containing `"Pokemon"`.
     - **Facet counts**: call `getListings({ q: "" })` and assert `facets.gameName` is an object
       with at least one key and numeric values.
     - **Fallback when keys absent**: temporarily set `process.env.ALGOLIA_APP_ID = ""` before
       calling `getListings` → assert it returns results from Postgres without throwing.
     - **`bulkSyncAllListings`**: call and assert `synced >= 0`, `errors === 0`, function does
       not throw.
     - **Cron route**: `GET /api/cron/algolia-sync` with correct `CRON_SECRET` bearer token →
       200 `{ ok: true }`; without token → 401.
     - **Instant search debounce**: unit-level assertion that firing 5 keystrokes within 350 ms
       results in only 1 Algolia call (mock `index.search` and count invocations).

9. **Edge cases**
   - `ALGOLIA_APP_ID` / `ALGOLIA_ADMIN_KEY` / `NEXT_PUBLIC_ALGOLIA_SEARCH_KEY` absent (any
     combination): every server and client path falls back gracefully — zero crashes, zero blank
     pages. Log a single `console.warn("Algolia not configured — falling back to Postgres")` at
     module initialisation.
   - Algolia rate-limit or network timeout: `try/catch` in `syncListingToAlgolia` catches it;
     the listing save still succeeds; a background reconciliation (nightly cron) heals the gap.
   - `description` field longer than 200 chars: truncated with `description.slice(0, 200)` before
     the Algolia record is built — never send full text to the index.
   - Deleted listing: if `listing` is `null` in `syncListingToAlgolia` (race condition), call
     `index.deleteObject(listingId)` defensively and return.
   - Algolia `saveObjects` batch limit is 1 000 per call — `bulkSyncAllListings` must respect this;
     split into ≤ 1 000 chunks.
   - URL params with special characters (`q=pokemon+go`): decode with `decodeURIComponent` before
     passing to Algolia `query` — avoid double-encoding.
   - Pagination: Algolia uses 0-indexed pages; URL params use 1-indexed pages. Always convert:
     `algoliaPage = Math.max(0, (urlPage ?? 1) - 1)`. Return `totalPages = Math.ceil(nbHits / hitsPerPage)`.
   - Sort replicas: if a sort replica does not exist in Algolia (dev env with only the main index),
     fall back to the main index rather than throwing.
   - Admin key in client bundle: add an ESLint rule comment or a `server-only` import guard in
     `src/lib/algolia.ts` to ensure `ALGOLIA_ADMIN_KEY` is never referenced from a Client Component.
     Consider importing `"server-only"` at the top of `src/lib/algolia.ts` (the package throws a
     build-time error if imported client-side).

### Rules
- `ALGOLIA_ADMIN_KEY` is server-only. It must never appear in any Client Component, any
  `"use client"` file, or any variable prefixed `NEXT_PUBLIC_`. Add `import "server-only"` to
  `src/lib/algolia.ts` to enforce this at build time.
- The URL param contract (`q`, `game`, `type`, `min`, `max`, `sort`, `page`) must remain
  identical. No existing page, link, or sitemap URL changes. Zero URL regressions.
- Algolia sync is fire-and-forget — it must never throw into the listing create/update/status
  transaction and must never cause a 500. The append-only `LedgerEntry` + order state machine
  must be completely unaffected.
- When `ALGOLIA_APP_ID` or `NEXT_PUBLIC_ALGOLIA_SEARCH_KEY` are absent, every affected UI and
  API path must degrade to the Postgres fallback — same as the Sentry/Turnstile/R2 env-safe pattern.

### Report back
CLAUDE.md output format + QA CHECKLIST below.

---

## ✅ QA CHECKLIST
- [ ] `npm install algoliasearch @algolia/client-search` succeeds; no peer-dep conflicts
- [ ] `ALGOLIA_APP_ID`, `ALGOLIA_ADMIN_KEY`, `NEXT_PUBLIC_ALGOLIA_SEARCH_KEY` in `.env.example`
- [ ] `NEXT_PUBLIC_ALGOLIA_APP_ID` in `.env.example` (public alias for client-side init)
- [ ] `src/lib/algolia.ts` has `import "server-only"`; `getAlgoliaAdminClient()` returns `null` when keys absent
- [ ] `algolia-setup-index.ts` script configures searchable attributes, facets, custom ranking, typo tolerance
- [ ] `syncListingToAlgolia` upserts ACTIVE listings and deletes non-ACTIVE listings from the index
- [ ] `syncListingToAlgolia` does not throw when Algolia keys are absent; logs warn instead
- [ ] `bulkSyncAllListings` processes all listings in ≤ 1 000-record batches; returns `{ synced, deleted, errors }`
- [ ] `createListing` / `updateListing` / `setListingStatus` call `syncListingToAlgolia` fire-and-forget
- [ ] Cron `GET /api/cron/algolia-sync` → 200 with correct bearer; 401 without bearer
- [ ] Cron entry present in `vercel.json` (`0 3 * * *`)
- [ ] `getListings` uses Algolia when configured; falls back to Postgres when keys absent — verified in QA harness
- [ ] URL params (`q`, `game`, `type`, `min`, `max`, `sort`, `page`) produce identical results on both paths
- [ ] Pagination correct: page 1 = Algolia page 0; `totalPages` matches `nbHits / hitsPerPage`
- [ ] Facet counts rendered: `"Pokemon GO (42)"` format; hidden gracefully when Postgres path is used
- [ ] `InstantSearchBar` shows ≤ 5 suggestions; 350 ms debounce (only 1 Algolia call per keystroke burst)
- [ ] `InstantSearchBar` absent/empty when `NEXT_PUBLIC_ALGOLIA_SEARCH_KEY` unset — no JS error
- [ ] Typo test: searching `"pokmon"` returns Pokemon GO listings (verified in QA harness)
- [ ] `description` field in Algolia record is ≤ 200 chars
- [ ] `ALGOLIA_ADMIN_KEY` is absent from all client bundles (`next build --debug` or bundle analyser confirms)
- [ ] `scripts/qa-step28.ts` — all assertions pass (`npx tsx scripts/qa-step28.ts`)
- [ ] Search results render in < 200 ms on the Algolia path (browser DevTools Network tab)
- [ ] `typecheck`/`lint`/`build` pass; mobile responsive (filter bar + facets usable on 375 px)
- [ ] Step 28 ticked in `docs/ROADMAP.md`; key choices logged in `docs/DECISIONS.md`
- [ ] Final Status: ✅ Pass

---

## 👉 After this step
Tell me **"Step 28 done"** → **Step 29 — Sumsub KYC** (automated identity + document verification,
replacing the manual admin KYC flow from Step 15 with a Sumsub-hosted applicant flow).

## 🔑 Tokens needed: **`ALGOLIA_APP_ID`**, **`ALGOLIA_ADMIN_KEY`**, **`NEXT_PUBLIC_ALGOLIA_SEARCH_KEY`**.
