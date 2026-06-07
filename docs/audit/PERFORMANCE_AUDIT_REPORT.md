# GETX — Performance & Scalability Audit

> Build: Step 07/36. Verified from code. Lighthouse not run headlessly here — CWV notes are architectural.

## Scores: Performance 80 / 100 · Scalability 55 / 100

## 1. Strengths (verified)
- **Server-first**: pages/content are RSC; only the filter bar, gallery, buy box, drawer and toaster are client islands. LCP elements paint without waiting on client JS.
- **No N+1**: list + detail each use ONE Prisma query with `include` (seller + game). Verified in `marketplace.ts` (`searchListings`, `getListingBySlug`) and `catalog.ts`.
- **Indexed**: every filter/sort column is indexed. Step 07 added `@@index([status, createdAt])` (default sort) and `@@index([ratingAvg])` (rating sort); `trustScore`, `priceMinor`, `gameId`, `categoryId`, `status`, composites already existed.
- **`cache()`-wrapped reads** share one Neon round-trip across layout + metadata + page.
- **Images**: `next/image` with `sizes` + `priority` on first-row/LCP; skeletons sized to match cards (low CLS).
- **Pagination is link-based** (zero JS) on catalog; marketplace uses `useTransition` so filtering never blocks input.

## 2. Findings

| Sev | Finding | Fix |
|---|---|---|
| 🟠 High (scale) | **ILIKE `contains` with leading `%`** can't use a B-tree index → sequential scan. Fine at tens/hundreds of listings; degrades as the catalog grows. | Postgres `pg_trgm` GIN index (interim) or **Algolia at Step 28** (already planned). Documented. |
| 🟠 High (scale) | **In-memory rate-limiter** is per-instance → ineffective on multi-instance serverless and a memory-growth risk under load. | Redis/Upstash (Step 32; pull forward for auth). |
| 🟡 Med | **`framer-motion` + `gsap`** are dependencies (used by home/footer animations). If not lazy/`next/dynamic`-loaded they add significant JS to first load. | Verify both are code-split + below-the-fold only; respect `prefers-reduced-motion` (footer already does). Measure with `@next/bundle-analyzer`. |
| 🟡 Med | **Marketplace is fully dynamic** (reads `searchParams`) — no caching for anonymous browse traffic. | Add short `revalidate`/Cache Components (Next 16 `use cache`) for the *unfiltered* marketplace + catalog pages to cut TTFB and DB load. |
| 🟡 Med | **`getActiveGames` runs a per-game `_count` subquery.** Fine for 5 games; watch as games grow (Step 30). | Acceptable now; revisit with a single grouped count if game count rises. |
| 🟢 Low | **Suspense `key` remounts the whole results subtree** on each filter change → full skeleton flash + refetch. Intended, but on slow networks feels jumpy. | Optionally keep the previous grid dimmed during the transition instead of full skeleton. |
| 🟢 Low | No `remotePatterns` for image host yet (no remote images until Step 12). | Configure narrowly when R2 lands; otherwise `next/image` throws on remote URLs. |

## 3. Core Web Vitals (architectural assessment, not measured)
- **LCP**: hero is static server HTML; gallery/cards use `priority`. Good — likely < 2.5s. *Risk*: webfont (Poppins) swap + any non-lazy gsap/framer.
- **CLS**: skeletons + fixed aspect ratios + sized images. Good — likely < 0.1.
- **INP**: filter bar is debounced + `useTransition`; native selects. Good. *Risk*: large client islands if framer/gsap aren't split.
- **TTFB**: serverless cold start + Neon pooled. Acceptable; improves with caching the anonymous browse pages.

## 4. Scalability
- **DB**: Neon pooled URL for app, direct for migrations — correct. Append-only ledger is scale-friendly.
- **Search**: ILIKE is the scaling ceiling → Algolia (28).
- **Rate-limit/sessions**: in-memory limiter won't scale; JWT sessions scale fine.
- **Realtime**: Socket.io server (Step 11) is the next stateful component — needs Railway always-on + sticky sessions.
- **Jobs**: Vercel Cron for escrow auto-release (Step 10); no queue/Redis yet (fine at MVP).

## Verdict
*Existing* code is fast and correctly indexed. Scalability debt is **known, deferred and documented**
(search → Algolia, rate-limit → Redis). Measure the real Lighthouse + bundle before launch; verify
gsap/framer are lazy.
