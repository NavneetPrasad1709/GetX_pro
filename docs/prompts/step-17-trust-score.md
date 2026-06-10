# STEP 17 — Live Trust Score

> Goal: Compute a 0–100 trust score per seller from behaviour signals, store a live breakdown, and
> broadcast real-time badge updates (#4d7cfe → red/amber/green) to listing cards, seller profiles,
> and checkout — so buyers always see a trustworthy, up-to-date credibility signal.

---

## PROMPT (copy from here ⬇️)

You are the CTO + Senior Backend + Senior Frontend + Senior QA Engineer of GETX. Read `CLAUDE.md` +
`docs/ENGINEERING-GUARDRAILS.md` (§1, §4, §7, §8). Work in `D:\GetX`. This is **Step 17 — Live Trust Score**.
Talk Hinglish. Follow the full workflow.

### Task

1. **DB migration** — `prisma/migrations/YYYYMMDDHHMMSS_step17_trust_score/` (hand-written, never
   `migrate dev`; use `prisma migrate diff` → copy SQL → `migrate deploy`):
   - Add `trustScoreUpdatedAt DateTime?` to `SellerProfile`.
   - Add `trustScoreBreakdown Json?` to `SellerProfile` (stores per-signal breakdown object, schema
     below).
   - `SellerProfile.trustScore Int` already exists — do NOT recreate it; default stays `0`.
   - No data-loss risk; both columns are nullable. Run `prisma generate` after deploy.

2. **Trust-score formula** — `src/server/services/trust-score.ts` (pure, fully testable):

   Implement and export `recomputeTrustScore(sellerId: string): Promise<TrustScoreResult>`.

   **Signal weights (clamp raw signal to 0 before weight, then sum, then clamp total 0–100):**

   | Signal | Max pts | Logic |
   |---|---|---|
   | `completionRate` | 30 | `COMPLETED` orders / (COMPLETED + CANCELLED + DISPUTED) × 30; if no closed orders → 15 (neutral) |
   | `ratingScore` | 25 | `(SellerProfile.ratingAvg / 5) × 25`; if `ratingCount === 0` → 12 (neutral) |
   | `responseTime` | 20 | avg minutes between consecutive buyer→seller messages in `Message` table (same `Conversation`); ≤30 min → 20 / ≤120 min → 15 / ≤1440 min → 8 / else → 0; if no messages → 10 (neutral) |
   | `accountAge` | 10 | days since `User.createdAt`; ≥180 → 10 / ≥90 → 7 / ≥30 → 4 / else → 1 |
   | `kycVerified` | 10 | `SellerProfile.kycStatus`: `APPROVED` → 10 / `PENDING` → 3 / else → 0 |
   | `disputeRate penalty` | −15 max | disputed orders / total closed; >20% → −15 / >10% → −8 / else → 0 |

   **Breakdown JSON shape** (store in `trustScoreBreakdown`):
   ```ts
   {
     completionRate: number;   // pts awarded
     ratingScore: number;
     responseTime: number;
     accountAge: number;
     kycVerified: number;
     disputePenalty: number;   // negative or 0
     total: number;            // clamped 0–100
     computedAt: string;       // ISO timestamp
   }
   ```

   After computing, write to DB in a single `prisma.sellerProfile.update`:
   - `trustScore = clamped total`
   - `trustScoreBreakdown = breakdown`
   - `trustScoreUpdatedAt = new Date()`

   **Edge cases:**
   - Seller with no orders, no messages, no KYC → neutral score ≈ 28 (15+12+10+1+0+0).
   - `ratingAvg` stored as float in DB — multiply carefully, then `Math.round`; all intermediate
     values stay numbers (not minor units — trust score is not money).
   - If `SellerProfile` does not exist for the given `sellerId`, throw a typed error — do not
     create it silently.
   - `disputeRate` penalty is applied AFTER summing positive signals, then clamp.

3. **Hook recompute into existing services** (no new migration needed):

   - `src/server/services/escrow.ts` → in `confirmReceipt` / `releaseOrder` (after order reaches
     `COMPLETED` status), call `recomputeTrustScore(order.sellerId)` **outside** the main DB
     transaction (post-commit side effect, fire-and-forget; wrap in try/catch + Sentry capture so a
     score failure never rolls back the order).
   - `src/server/services/reviews.ts` → after a new `Review` row is inserted and
     `SellerProfile.ratingAvg` / `ratingCount` are updated, call `recomputeTrustScore(sellerId)`.
   - Both callers must also trigger the Socket.io broadcast (see Task 4) by calling
     `broadcastTrustUpdate(sellerId, score, badge)` from `src/lib/socket-token.ts` or a new
     `src/lib/trust-broadcast.ts` helper (see below).

4. **Nightly Vercel Cron** — `/api/cron/trust-score` (GET, `src/app/api/cron/trust-score/route.ts`):
   - Fail-closed Bearer auth identical to `/api/cron/auto-release`: verify
     `Authorization: Bearer ${process.env.CRON_SECRET}` → 401 if absent/wrong.
   - Query all `SellerProfile` rows (select `userId` only); recompute each sequentially (not
     parallel — protect DB). Log progress; if any single seller throws, log + continue (never abort
     the whole run).
   - Return `{ recomputed: N, errors: M }` JSON.
   - Register in `vercel.json` under `crons`: path `/api/cron/trust-score`, schedule `0 2 * * *`
     (02:00 UTC nightly, after the */15 escrow cron).
   - This handles `accountAge` drift (score changes as sellers age without new activity).
   - **Idempotency**: running twice in a row must yield the same score (pure formula + overwrite).

5. **Socket.io broadcast** — `src/lib/trust-broadcast.ts` (new file):
   - Export `broadcastTrustUpdate(sellerId: string, score: number, badge: 'red'|'amber'|'green'): Promise<void>`.
   - Derive badge: score < 40 → `'red'`; score < 70 → `'amber'`; else → `'green'`.
   - Call the secured internal API on the Socket.io Railway server:
     `POST ${process.env.SOCKET_INTERNAL_URL}/internal/trust-updated` with
     `Authorization: Bearer ${process.env.INTERNAL_API_SECRET}` and body
     `{ sellerId, score, badge }`.
   - The Socket.io server (already has the internal-API pattern from Step 11) should handle
     `POST /internal/trust-updated`: broadcast `trust:updated` event to all sockets in room
     `seller:${sellerId}` (clients join this room when viewing a seller page or checkout for that
     seller's listing).
   - Add the `trust:updated` room-join logic to `socket-server/src/index.ts`: on event
     `join:seller` `{ sellerId }` (auth-checked, same 3-layer pattern as Step 11), socket joins
     room `seller:${sellerId}`.
   - Degrade gracefully if `SOCKET_INTERNAL_URL` or `INTERNAL_API_SECRET` is absent: log a warning,
     return without throwing — score is still saved to DB.

6. **Frontend components**:

   a. `src/components/shared/trust-badge.tsx` — `<TrustBadge score={number} breakdown={TrustBreakdown | null} size?: 'sm'|'md'|'lg' />`:
      - Coloured pill: score < 40 → red (`bg-red-500`), 40–69 → amber (`bg-amber-500`), ≥70 → green (`bg-green-500`).
      - Shows score number + a lock/shield icon.
      - Tooltip (shadcn `Tooltip`) on hover/focus: shows per-signal breakdown in a small table
        (signal name, points awarded, max points). Accessible (`aria-label`, keyboard-navigable).
      - `size='sm'` for listing cards (compact), `'md'` default for seller profile, `'lg'` for checkout.
      - Export a `getBadgeColor(score: number)` utility used by both the component and the socket client.

   b. **ListingCard** (`src/components/marketplace/listing-card.tsx` or wherever it lives) — add
      `<TrustBadge score={listing.seller.trustScore} breakdown={null} size="sm" />` next to seller
      name. Fetch `trustScore` in the listing query (already on `SellerProfile`).

   c. **Seller profile header** (`src/app/(shop)/seller/[username]/page.tsx` or equivalent) — add
      `<TrustBadge>` in the hero section next to seller name; pass full `trustScoreBreakdown`.

   d. **Checkout** (`src/app/(dashboard)/orders/[id]/page.tsx` or checkout page) — add
      `<TrustBadge size="lg">` in the seller info block at the top.

   e. **Live update hook** — `src/hooks/use-trust-score.ts`:
      - Accepts `sellerId: string`, `initialScore: number`.
      - Connects to Socket.io (reuse existing socket context/hook from Step 11), joins room
        `seller:${sellerId}` on mount (emit `join:seller { sellerId }`), listens for `trust:updated`
        and updates local state.
      - Returns `{ score, badge }`. Used in seller profile and checkout pages only (not listing cards
        — too many simultaneous socket rooms).

7. **Admin manual override** (`src/app/admin/users/[id]/page.tsx` or the admin user-detail page from Step 15):
   - Add a "Trust Score Override" card: shows current score + breakdown JSON (pretty-printed).
   - A numeric input (0–100) + "Override" button: calls a new Server Action
     `src/server/actions/admin-trust.ts` → `overrideTrustScore(userId, overrideValue)`.
   - The action: ADMIN-only (check role), validate value 0–100 (Zod), update `SellerProfile.trustScore`
     (and set `trustScoreBreakdown.overriddenBy = adminId, overriddenAt = ISO` in breakdown JSON),
     write an `AuditLog` row (`action: 'TRUST_SCORE_OVERRIDE'`, `targetId: userId`,
     `metadata: { previous, override: overrideValue }`), then call `broadcastTrustUpdate`.
   - Show success toast + refresh displayed score.

8. **Edge cases**:
   - Seller deleted mid-cron → catch + log, continue.
   - `ratingAvg` is `null` (Prisma Float?) → treat as 0, use neutral 12 pts.
   - All orders are in `PENDING`/`IN_PROGRESS` (no closed orders) → use neutral 15 for completionRate.
   - `Message` table has messages but all from same sender (no reply) → responseTime signal → neutral 10.
   - Admin override should NOT be overwritten by the next cron run — add a `trustScoreOverride Boolean @default(false)` flag to `SellerProfile`; cron skips sellers where `trustScoreOverride = true`. Include this column in the migration.
   - Score recompute is idempotent: calling twice yields identical output (deterministic formula).
   - `broadcastTrustUpdate` failure must never propagate to the caller (always try/catch + Sentry).

### Rules
- Trust score computation is pure and side-effect-free inside `recomputeTrustScore` — the DB write
  and broadcast happen in the caller, not inside the formula function. Keep formula and persistence
  separated so unit tests can test the formula without hitting the DB.
- Never recompute trust score inside a DB transaction — it is a post-commit side effect; a score
  failure must not roll back an order or review.
- Money is not involved here, but `AuditLog` is still required for admin overrides (same standard
  as Step 15).
- Degrade gracefully when `SOCKET_INTERNAL_URL` / `INTERNAL_API_SECRET` are absent — score must
  still persist to DB; only the live broadcast is skipped.

### Report back
CLAUDE.md output format + QA CHECKLIST below.

---

## ✅ QA CHECKLIST
- [ ] Migration applies cleanly (`migrate deploy`); `trustScoreUpdatedAt`, `trustScoreBreakdown`, `trustScoreOverride` columns exist on `SellerProfile`
- [ ] Formula unit tests in `scripts/qa-step17.ts`: neutral seller ≈ 28 pts, full 5-star + KYC + 180d age + fast reply + no disputes ≈ 100 pts, heavy dispute penalty reduces score correctly
- [ ] Badge colour thresholds correct: score 39 → red, 40 → amber, 69 → amber, 70 → green
- [ ] `recomputeTrustScore` is idempotent: running twice in a row produces identical DB state
- [ ] Score recomputes after `confirmReceipt` / `releaseOrder` (complete an order in dev, check `trustScoreUpdatedAt` updated)
- [ ] Score recomputes after new review is created
- [ ] Cron `/api/cron/trust-score`: 401 without Bearer, runs clean with Bearer, returns `{ recomputed, errors }` JSON
- [ ] Cron skips sellers with `trustScoreOverride = true`
- [ ] Socket.io broadcast: after recompute, `trust:updated` event fires to `seller:<id>` room; use qa harness mock or manual test with two browser tabs
- [ ] `<TrustBadge>` renders correct colour + tooltip breakdown on listing card (sm), seller profile (md/lg), checkout
- [ ] `use-trust-score` hook updates score live when `trust:updated` event arrives
- [ ] Admin override: ADMIN-only (buyer/seller get 403), value 0–100 accepted, out-of-range rejected, AuditLog row written, `trustScoreOverride` flag set, next cron skips that seller
- [ ] `broadcastTrustUpdate` failure (SOCKET_INTERNAL_URL absent) does not throw; score still saved to DB
- [ ] `scripts/qa-step17.ts` runs via `npx tsx scripts/qa-step17.ts`; all assertions pass; test data cleaned in `finally`
- [ ] `typecheck`/`lint`/`build` pass; mobile responsive (badge visible on mobile listing cards)
- [ ] Step 17 ticked in `docs/ROADMAP.md`; key decisions logged in `docs/DECISIONS.md`
- [ ] Final Status: ✅ Pass

---

## 👉 After this step
**Step 18 — AI Fraud Radar**: use `claude-opus-4-8` to analyse listing text, seller behaviour, and
trust signals for fraud/scam detection; auto-flag suspicious listings for admin review.

## 🔑 Tokens needed: **None** (uses existing Socket.io server on Railway + Neon DB).
