# STEP 21 — Loyalty Points + Referral Program

> Goal: Earn points on every buy/sell, redeem them as checkout discounts, and grow the user base
> with a referral program that rewards both referrer and referee on first completed order.

---

## PROMPT (copy from here ⬇️)

You are the CTO + Senior Backend + Senior Full-Stack Engineer of GETX. Read `CLAUDE.md` +
`docs/ENGINEERING-GUARDRAILS.md` (§1, §4, §5, §7). Work in `D:\GetX`. This is **Step 21 — Loyalty Points + Referral**.
Talk Hinglish. Follow the full workflow.

### Task

1. **Database models + migration** (`prisma/schema.prisma` + new migration folder
   `prisma/migrations/20260608XXXXXX_step21_loyalty_referral/`):

   - **`LoyaltyPoint`** — append-only event log (never mutate, only insert):
     ```
     id           String   @id @default(cuid())
     userId       String
     user         User     @relation(fields: [userId], references: [id])
     amount       Int                          // always positive (sign is in type)
     type         LoyaltyPointType             // EARN | REDEEM
     reason       LoyaltyPointReason           // PURCHASE | SALE | REFERRAL_BONUS | REFERRAL_EARN | SIGNUP_BONUS
     orderId      String?                      // FK to Order (nullable for SIGNUP_BONUS / REFERRAL_BONUS)
     order        Order?   @relation(...)
     createdAt    DateTime @default(now())
     @@index([userId])
     @@index([orderId])
     ```
   - **`Referral`**:
     ```
     id           String         @id @default(cuid())
     referrerId   String
     referrer     User           @relation("ReferrerReferrals", ...)
     refereeId    String         @unique            // one referral record per new user
     referee      User           @relation("RefereeReferral", ...)
     status       ReferralStatus // PENDING | COMPLETED
     bonusAwarded Boolean        @default(false)    // idempotency flag for referrer bonus
     createdAt    DateTime       @default(now())
     @@index([referrerId])
     ```
   - **`User`** — add two fields:
     - `referralCode  String?  @unique`  — 8-char A-Z0-9, generated at signup
     - `referredBy    String?`  — stores the referral code used at signup (nullable)
   - Add enums `LoyaltyPointType` (EARN, REDEEM) and `LoyaltyPointReason`
     (PURCHASE, SALE, REFERRAL_BONUS, REFERRAL_EARN, SIGNUP_BONUS) and `ReferralStatus`
     (PENDING, COMPLETED).
   - Generate the migration using the interactive-safe workflow:
     `npx prisma migrate diff --from-schema-datasource --to-schema-datamodel prisma/schema.prisma --script`
     → paste output into the hand-written migration SQL file → run `npx prisma migrate deploy`.
     Do NOT run `prisma migrate dev` (it is interactive and will hang).

2. **Loyalty config** (`src/config/loyalty.ts` — single source of truth, never hardcode rates):
   ```ts
   export const LOYALTY_CONFIG = {
     BUYER_POINTS_PER_RUPEE:   0.1,   // 1pt per ₹10 spent (order subtotal after discount)
     SELLER_POINTS_PER_RUPEE:  0.05,  // 1pt per ₹20 received (after seller commission)
     SIGNUP_BONUS_POINTS:      50,
     REFERRAL_BONUS_REFERRER:  200,   // awarded when referee's FIRST order reaches COMPLETED
     REFERRAL_EARN_REFEREE:    100,   // awarded to referee at signup via ref link
     REDEMPTION_RATE:          10,    // 100 pts = ₹10  → so 1pt = ₹0.10
     POINTS_PER_RUPEE_DISCOUNT: 100,  // 100pts redeems as ₹10 discount
     MAX_REDEMPTION_PCT:       0.20,  // max 20% of order subtotal can be discounted
   } as const;
   ```
   Export a helper `pointsToMinorUnits(points: number): number` (integer paisa, round-half-up)
   and `rupeeDiscountToPoints(rupees: number): number`.

3. **Loyalty service** (`src/server/services/loyalty.ts`):
   - `getLoyaltyBalance(userId: string): Promise<number>` — `Σ EARN − Σ REDEEM` across all
     `LoyaltyPoint` rows for the user. Never store a running total; always derive.
   - `getLoyaltyHistory(userId: string, take?: number): Promise<LoyaltyPoint[]>` — ordered
     `createdAt DESC`.
   - `awardPoints(tx: PrismaClient, userId: string, amount: number, reason: LoyaltyPointReason,
     orderId?: string): Promise<void>` — always called inside an existing transaction; inserts
     one `LoyaltyPoint` row with `type: EARN`.
   - `redeemPoints(tx: PrismaClient, userId: string, amount: number, orderId: string): Promise<void>`
     — inserts one `LoyaltyPoint` row with `type: REDEEM`; throws if balance < amount.
   - `computeRedemptionCap(subtotalMinor: number): number` — returns max redeemable points
     respecting the 20% subtotal cap: `floor(subtotalMinor * MAX_REDEMPTION_PCT / (REDEMPTION_RATE * 10))`
     (integer points).
   - `checkAndAwardReferralBonus(tx: PrismaClient, refereeId: string, orderId: string): Promise<void>`
     — called inside `releaseOrder`; finds `Referral` where `refereeId = refereeId AND status = PENDING
     AND bonusAwarded = false`; if found, atomically sets `bonusAwarded = true` + `status = COMPLETED`
     using `UPDATE … WHERE bonusAwarded = false` (CAS, idempotent); then awards 200pts to referrer
     (`awardPoints`) + marks referral `COMPLETED`. If already `bonusAwarded = true`, silently skips
     (no double-award).

4. **Signup integration** (`src/server/actions/auth.ts` or wherever new users are created):
   - On user creation, generate `referralCode`: 8-char random A-Z0-9 (`nanoid` or `crypto`), unique
     (retry on P2002 collision).
   - If `?ref=CODE` query param is present at signup:
     - Look up the `User` with `referralCode = CODE`; if found and `referrer.id !== newUser.id`:
       - Set `newUser.referredBy = CODE`.
       - Create `Referral { referrerId: referrer.id, refereeId: newUser.id, status: PENDING }`.
       - Award 100pts (`REFERRAL_EARN`, `SIGNUP_BONUS` reason) to the new user in the same tx.
   - Always award 50pts `SIGNUP_BONUS` to every new user (with or without referral code).
   - Store the `ref` code in a short-lived cookie (`ref_code`, 30-day max-age, HttpOnly, Secure) on
     the landing page so the code survives the multi-step signup flow. Read and clear it at the final
     create-user step.

5. **Checkout redemption** (`src/server/actions/checkout.ts` + `src/server/services/orders.ts`):
   - Accept optional `redeemPoints?: number` from the checkout form.
   - **Server-side recompute** (never trust the client amount): clamp to `min(requestedPoints,
     getLoyaltyBalance(userId), computeRedemptionCap(subtotal))`.
   - Convert clamped points to paisa via `pointsToMinorUnits`.
   - Apply as a line-item discount: `discountMinor = pointsToMinorUnits(clampedPoints)`.
   - Deduct from `buyerFeeMinor + subtotalMinor` to get final `totalMinor`.
   - Call `redeemPoints(tx, userId, clampedPoints, orderId)` inside the order-creation transaction.
   - Snapshot `loyaltyPointsRedeemed` on the `Order` model (add the field to schema if not present —
     `loyaltyPointsRedeemed Int @default(0)`).
   - If `redeemPoints = 0` or user has no balance, skip silently — checkout still works.

6. **Escrow release integration** (`src/server/services/escrow.ts` — `releaseOrder` function):
   Inside the existing release DB transaction, after moving funds:
   - Award buyer earn points: `awardPoints(tx, order.buyerId, buyerEarnPoints, 'PURCHASE', order.id)`
     where `buyerEarnPoints = floor(order.subtotalMinor * BUYER_POINTS_PER_RUPEE / 100)`.
   - Award seller earn points: `awardPoints(tx, order.sellerId, sellerEarnPoints, 'SALE', order.id)`
     where `sellerEarnPoints = floor(sellerNetMinor * SELLER_POINTS_PER_RUPEE / 100)` (sellerNet =
     subtotal minus commission, already computed).
   - Call `checkAndAwardReferralBonus(tx, order.buyerId, order.id)` to potentially unlock the
     referrer's 200pt bonus.
   - All of this is idempotent: if `awardPoints` is called twice for the same `orderId + reason`,
     a unique index on `(userId, orderId, reason, type)` in LoyaltyPoint prevents duplicate rows.
     Add this unique index: `@@unique([userId, orderId, reason, type])` — but only enforce for
     non-null orderId (partial unique via `@@index` + application-level guard for nullable orderId).

7. **Referral landing** (`src/app/(marketing)/ref/[code]/page.tsx`):
   - Server component: validate the code exists in DB; if invalid, redirect to home.
   - Set `ref_code` cookie (HttpOnly, Secure, 30-day) in a Route Handler or middleware.
   - Show a referral landing page with the referrer's display name (or "a friend") and a CTA
     "Sign up and get 100 bonus points". Render in v10 dark + blue design (Poppins, #4d7cfe).

8. **Dashboard pages**:

   a. **`/dashboard/loyalty`** (buyer, `src/app/(dashboard)/loyalty/page.tsx`):
      - Current balance (big, prominent).
      - Progress bar: points toward next reward tier (e.g., every 500pts = badge) — cosmetic MVP tier.
      - "Redeem at checkout" explainer card.
      - Referral section: user's unique referral link (`https://getx.live/ref/<code>`), copy-to-clipboard
        button, count of successful referrals and pending referrals.
      - Transaction history: paginated table (reason, amount +/−, date, order link if present).

   b. **`/seller/loyalty`** (seller, `src/app/(dashboard)/seller/loyalty/page.tsx`):
      - Same balance + history, but earn from SALE rows only in the history filter.
      - "You earn 1pt per ₹20 received after commission."

   Both pages are server components with Suspense fallbacks; use the existing dashboard layout and
   v10 design tokens.

9. **Checkout UI** (`src/app/(shop)/checkout/page.tsx` or relevant checkout component):
   - Show "You have X points (= ₹Y discount)" if balance > 0.
   - Input or toggle to redeem points (slider or text input, max = server-computed cap, but show
     a client hint based on balance).
   - Pass `redeemPoints` to the server action; display the applied discount line in the order summary.
   - If balance = 0, hide the section entirely (no clutter).

10. **Edge cases**:
    - Referral code for a non-existent user → silently ignore; proceed as normal signup.
    - User referring themselves (same IP or same email domain) → check `referrer.id !== newUser.id`
      + same-email domain heuristic (optional, log a warning, do not crash).
    - Points redeemed but order later disputed + refunded → on `escrow.refundOrder`, reverse the
      `redeemPoints` by inserting a compensating EARN row with reason `PURCHASE_REFUND` (add to enum).
      Keep the ledger balanced; never delete rows.
    - Double-award prevention: `bonusAwarded = false` CAS in `checkAndAwardReferralBonus`, plus
      the `@@unique` index on earn rows — test both in QA.
    - Loyalty points are non-transferable and cannot be cashed out (display this on the dashboard).
    - `getLoyaltyBalance` is called in the checkout server action; if the DB call fails, fail the
      redemption gracefully (treat as 0 points, do not block checkout).
    - 8-char `referralCode` collision retry: up to 5 attempts, then fall back to 12-char code.

### Rules
- Balance is always derived (`Σ EARN − Σ REDEEM`) — never store a mutable running total. Same
  append-only principle as `LedgerEntry`.
- Redemption amount is **always recomputed server-side** inside the checkout server action; the
  client value is an advisory hint only. The 20% cap is enforced on the server.
- All point awards inside `releaseOrder` must be part of the **same DB transaction** as the ledger
  movements; if the transaction rolls back, no points are awarded.
- Idempotency via `bonusAwarded` CAS for referral bonus and via `@@unique([userId, orderId, reason,
  type])` for earn rows. Never award the same event twice.

### Report back
CLAUDE.md output format + QA CHECKLIST below.

---

## ✅ QA CHECKLIST
- [ ] New user gets 50 signup bonus points; `getLoyaltyBalance` returns 50
- [ ] Referral link (`/ref/<code>`) sets cookie + shows landing page; invalid code redirects to home
- [ ] Referee signs up via referral link: gets 100 pts (REFERRAL_EARN) + 50 pts (SIGNUP_BONUS) = 150 total
- [ ] Referee completes first order (COMPLETED status): referrer gets 200 pts (REFERRAL_BONUS); `Referral.bonusAwarded = true`
- [ ] Referral bonus is idempotent: triggering `checkAndAwardReferralBonus` twice for the same refereeId awards 200pts only once
- [ ] Buyer earns correct points on order completion (1pt per ₹10 of subtotal)
- [ ] Seller earns correct points on order completion (1pt per ₹20 of net received after commission)
- [ ] Earn rows have `@@unique` guard: duplicate `(userId, orderId, reason, type)` is rejected
- [ ] Checkout: redeem 0 points → order total unchanged; redeem valid points → discount applied, `loyaltyPointsRedeemed` snapshotted on Order
- [ ] Checkout redemption cap: cannot redeem more than 20% of subtotal (server enforces even if client sends higher value)
- [ ] Redemption server-recompute: send inflated `redeemPoints` from client → server clamps to balance and cap
- [ ] Refund path: `refundOrder` inserts compensating EARN row (PURCHASE_REFUND), balance restored
- [ ] `/dashboard/loyalty` shows correct balance, history, referral link, copy button, referral counts
- [ ] `/seller/loyalty` shows correct balance and SALE-filtered history
- [ ] `loyalty.ts` config is the single source of truth; no hardcoded rates elsewhere
- [ ] `scripts/qa-step21.ts` passes all checks (earn-on-complete, referral E2E, redemption cap, balance calc, code uniqueness, double-award prevention)
- [ ] `typecheck`/`lint`/`build` pass; mobile responsive on both loyalty pages and checkout redemption UI
- [ ] Step 21 ticked in `docs/ROADMAP.md`; key choices logged in `docs/DECISIONS.md`
- [ ] Final Status: ✅ Pass

---

## 👉 After this step
Move to **Step 22 — Notifications** (in-app + email notifications for order events, chat messages,
dispute updates, and loyalty milestones via Resend or a lightweight queue).

## 🔑 Tokens needed: **None**
