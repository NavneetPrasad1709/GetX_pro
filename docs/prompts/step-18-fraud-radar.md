# STEP 18 — AI Fraud Radar

> Goal: Auto-flag suspicious listings, orders, users, and messages via fast rule-based signals and
> async Claude AI signals; flagged items surface in a dedicated `/admin/fraud` review queue.

---

## PROMPT (copy from here ⬇️)

You are the CTO + Senior Backend Engineer + Senior QA Engineer of GETX. Read `CLAUDE.md` +
`docs/ENGINEERING-GUARDRAILS.md` (§1 ledger, §4 pooling, §7 auth/rate-limit, §8 observability).
Work in `D:\GetX`. This is **Step 18 — AI Fraud Radar**. Talk Hinglish. Follow the full workflow.

### Task

1. **DB migration — `FraudFlag` model** (`prisma/migrations/20260608130000_step18_fraud_radar/`):
   - Fields: `id` (cuid), `targetType` (enum `LISTING | ORDER | USER | MESSAGE`), `targetId` (String),
     `reason` (String), `severity` (enum `LOW | MEDIUM | HIGH`), `status` (enum `OPEN | REVIEWED | DISMISSED`
     default `OPEN`), `autoDetected` (Boolean default `true`), `reviewedBy` (String?, FK → User),
     `reviewNote` (String?), `createdAt`, `updatedAt`.
   - Unique constraint: `@@unique([targetId, reason])` — prevents duplicate flags for the same signal.
   - Index on `[status, severity, createdAt]` for the admin queue sort.
   - Add `lastLoginIp` (String?) to the `User` model (stored on every sign-in via Auth.js callbacks).
   - Use the `prisma migrate diff` → hand-written migration SQL → `prisma migrate deploy` workflow
     (never `migrate dev` — it is interactive). After migration, run `prisma generate`.

2. **Fraud config blocklist** (`src/config/fraud.ts`):
   - Export `SCAM_PHRASES: string[]` — an initial set of ~20 common scam phrases for gaming
     marketplaces (e.g. "whatsapp me", "telegram", "pay outside", "discord dm", "cashapp",
     "gift card", "western union", "zelle", "bypass escrow", "direct trade", "off platform",
     "contact me at", "free account", "too good to be true", "guaranteed win", etc.).
   - Export `FRAUD_CONFIG` object with thresholds: `PRICE_BELOW_AVG_THRESHOLD = 0.80`,
     `IP_ACCOUNTS_PER_24H = 3`, `DISPUTE_WITHIN_MINUTES = 60`, `LOW_SALES_HIGH_VALUE_SALES = 5`,
     `LOW_SALES_HIGH_VALUE_AMOUNT_MINOR = 5_000_000` (₹50k in paise),
     `CARD_TESTING_ORDERS_PER_HOUR = 10`, `AI_SCAM_SCORE_THRESHOLD = 7`.
   - All thresholds configurable here; never hardcode in service.

3. **Rule-based fraud signals** (`src/server/services/fraud-radar.ts`):
   Implement `checkListingFraud`, `checkOrderFraud`, `checkMessageFraud`, and `checkUserIpFraud`
   functions. Each returns `Promise<FraudFlag[]>` (the newly created flags). Use upsert on
   `[targetId, reason]` to prevent duplicates — if flag already exists update `updatedAt` only,
   do not create a second row.

   **Rule signals (synchronous, run in the same request):**
   - R1 — Listing: seller has `totalSales < 5` (from `SellerProfile`) AND listing price is more
     than 80% below the average price of other `ACTIVE` listings in the same category
     → `severity: HIGH`, reason `"new_seller_price_anomaly"`.
   - R2 — User (IP): count `User` rows where `lastLoginIp = currentIp` AND `createdAt > now()-24h`
     → if count > `FRAUD_CONFIG.IP_ACCOUNTS_PER_24H` → `severity: HIGH`, reason `"ip_multi_account"`,
     `targetType: USER`, `targetId: userId`.
   - R3 — Order: order `createdAt` to associated `Dispute.createdAt` gap < 60 min →
     `severity: MEDIUM`, reason `"instant_dispute"`.
   - R4 — Listing title: title (lowercased) contains any phrase from `SCAM_PHRASES` →
     `severity: MEDIUM`, reason `"scam_phrase_title"`.
   - R5 — Listing: seller `totalSales < 5` AND `priceMinor > LOW_SALES_HIGH_VALUE_AMOUNT_MINOR` →
     `severity: MEDIUM`, reason `"new_seller_high_value"`.
   - R6 — Order/Buyer: count orders by `buyerId` in the last 1 hour; if count > 10 →
     `severity: HIGH`, reason `"card_testing"`, `targetType: USER`, `targetId: buyerId`.

   **Integration points (call from existing services):**
   - `checkListingFraud(listingId)` called from `src/server/actions/listings.ts` (or the listing
     create server action) **after** the listing is saved, fire-and-forget (`void checkListingFraud(...)`)
     — never block the response.
   - `checkOrderFraud(orderId)` called from `src/server/services/orders.ts` inside
     `applyPaymentEvent` after status transitions to `PAID`, fire-and-forget.
   - `checkMessageFraud(messageId)` called from `src/server/services/chat.ts` after message
     is persisted, fire-and-forget.
   - `checkUserIpFraud(userId, ip)` called from the Auth.js `signIn` callback (also where
     `lastLoginIp` is written to the User row).
   - All calls are fire-and-forget: wrap in `.catch(err => console.error('[fraud-radar]', err))`
     so fraud checks never crash the main flow.

4. **AI signals — async Claude analysis** (`src/server/services/fraud-radar.ts`, separate async fns):
   Use model **`claude-haiku-4-5-20251001`** (fast + cheap). Calls are async; results are upserted
   as FraudFlags just like rule signals.

   - **`analyzeListingDescriptionAI(listingId)`**: fetch listing title + description. Call Claude:
     ```
     System: "You are a fraud detection assistant for a gaming marketplace. Reply with ONLY valid JSON."
     User: "Rate the scam likelihood of this game listing on a scale 0-10 and give a one-line reason.
            Title: <title>
            Description: <description>
            Reply format: {"score": <0-10>, "reason": "<one line>"}"
     ```
     Parse response JSON (Zod: `z.object({ score: z.number(), reason: z.string() })`).
     If `score >= AI_SCAM_SCORE_THRESHOLD` → upsert `FraudFlag` with `severity: HIGH`,
     reason `"ai_listing_scam_score"`, store score + reason in a `metadata` JSON field
     (add `metadata Json?` to the model in the migration). Log + swallow Claude errors gracefully.

   - **`analyzeMessageAI(messageId)`**: fetch message body. Detect external contact info or links
     (URLs, phone numbers, email addresses, "discord", "telegram", "whatsapp", etc.) using a simple
     regex pre-check first — if regex hits, call Claude only if needed to confirm, otherwise skip
     the API call (save cost). If confirmed → upsert `FraudFlag` with `severity: MEDIUM`,
     reason `"ai_message_external_contact"`.

   - Graceful degradation: if `ANTHROPIC_API_KEY` is absent or the Claude call throws, log the
     error to Sentry (`Sentry.captureException`) and continue — no flag is created, no crash.

   - Both AI functions are called fire-and-forget from the same integration points as rule signals,
     with a combined helper: `checkListingFraud` calls rules + schedules AI analysis, etc.

5. **HIGH flag → SupportTicket** (`src/server/services/fraud-radar.ts`):
   After creating any `FraudFlag` with `severity: HIGH`, also create a `SupportTicket` (from Step 16)
   with `title: "AUTO-FLAG HIGH: <reason>"`, `body: "Automated fraud signal. targetType=<type> targetId=<id>"`,
   `priority: HIGH`, `status: OPEN`, `autoCreated: true` (add this boolean field if not present — via
   migration). Wrap in try/catch so a missing SupportTicket table in dev never crashes fraud logic.

6. **Admin fraud queue** (`src/app/admin/fraud/page.tsx` + supporting components):
   - Route: `/admin/fraud` — ADMIN-only (server-side role check; redirect to `/` if not admin).
   - Fetch `OPEN` FraudFlags ordered by `severity DESC` then `createdAt ASC` (HIGH first).
   - Display a table with columns: Severity badge (HIGH=red, MEDIUM=amber, LOW=blue), Target type +
     clickable ID link (links to `/admin/listings/[id]`, `/admin/orders/[id]`, `/admin/users/[id]`
     respectively), Reason, Auto-detected badge, Created at, Actions.
   - **Dismiss action** (Server Action `dismissFraudFlag(flagId, note)`): sets `status: DISMISSED`,
     writes `reviewNote` + `reviewedBy` (current admin userId) + `updatedAt`. Writes `AuditLog`.
   - **Act action** (Server Action `actOnFraudFlag(flagId, action, note)`): `action` enum
     `BAN_USER | REMOVE_LISTING`. For `BAN_USER`: set `User.status = BANNED` (add field if missing).
     For `REMOVE_LISTING`: set `Listing.status = REMOVED`. Then sets flag `status: REVIEWED`,
     writes `reviewedBy`, `reviewNote`, `AuditLog`. All in a single `prisma.$transaction`.
   - Pagination: 50 per page; show count of open HIGH / MEDIUM / LOW in header chips.
   - Empty state when queue is clear: "No open fraud flags. Great job!"
   - All mutations re-validate admin role server-side. Never trust client-sent role.

7. **Edge cases**:
   - Duplicate prevention: upsert on `[targetId, reason]` — verified in QA.
   - Fire-and-forget never blocks user-facing request; Sentry captures errors.
   - `analyzeListingDescriptionAI` skips call and logs if listing not found or body is empty.
   - `analyzeMessageAI` skips Claude call entirely if regex finds no suspicious content.
   - Flagging a deleted/non-existent target is a no-op (skip upsert, log warning).
   - Admin cannot act on an already-`REVIEWED` or `DISMISSED` flag (return 409 / show toast).
   - `lastLoginIp` is never logged or displayed in UI — internal only, used only for IP signal.
   - If `SupportTicket` model doesn't exist yet in the DB (pre-Step-16 env), catch and log, no crash.
   - R1 price comparison: if there are fewer than 3 comparable listings, skip the signal (not enough data).

8. **QA harness** (`scripts/qa-step18.ts`):
   Use `npx tsx scripts/qa-step18.ts`. Follow repo convention: `ok()` / `threw()` helpers,
   real Prisma against dev DB, test data cleaned up in `finally`. Cover:
   - Each of R1–R6 fires correctly given seeded data.
   - AI mock: stub `analyzeListingDescriptionAI` to return score 8 → FraudFlag HIGH created.
   - Duplicate prevention: calling checkListingFraud twice for the same listing+reason = 1 flag row.
   - Admin dismiss: sets status DISMISSED + reviewNote, AuditLog written.
   - HIGH flag → SupportTicket created automatically.
   - Normal listing with reasonable price + trustworthy seller → no flag (no false positives).
   - Print summary: `X/X tests passed`.

### Rules
- Fraud checks are **always fire-and-forget** — they must never throw to the caller or block
  a user-facing response. Every call site wraps in `.catch()`.
- **AI calls degrade gracefully**: absent `ANTHROPIC_API_KEY` or Claude error → log + skip,
  never crash. Use `claude-haiku-4-5-20251001` only (not Sonnet/Opus — cost control).
- **Duplicate prevention is mandatory**: use upsert on `[targetId, reason]`; the admin queue must
  never show the same signal twice.
- All admin mutations (dismiss, act) check ADMIN role server-side, write `AuditLog`, and execute
  money/status changes inside a `prisma.$transaction`.

### Report back
CLAUDE.md output format + QA CHECKLIST below.

---

## ✅ QA CHECKLIST
- [ ] Migration applied cleanly: `FraudFlag` table exists with unique `[targetId, reason]` index; `User.lastLoginIp` added
- [ ] R1 fires: new seller (<5 sales) + price >80% below category avg → HIGH flag created
- [ ] R2 fires: >3 accounts from same IP in 24h → HIGH flag on user
- [ ] R3 fires: dispute opened within 60 min of order creation → MEDIUM flag
- [ ] R4 fires: listing title contains scam phrase from blocklist → MEDIUM flag
- [ ] R5 fires: new seller (<5 sales) + listing price >₹50k → MEDIUM flag
- [ ] R6 fires: buyer places >10 orders in 1h → HIGH card-testing flag
- [ ] AI mock score ≥7 → FraudFlag HIGH created with `ai_listing_scam_score` reason
- [ ] AI mock message with external link → FraudFlag MEDIUM created
- [ ] Duplicate prevention: same targetId+reason called twice = exactly 1 row in DB
- [ ] `/admin/fraud` queue shows OPEN flags sorted HIGH → MEDIUM → LOW; ADMIN-only (buyer/seller get redirected)
- [ ] Dismiss action: sets DISMISSED + reviewNote + reviewedBy; AuditLog written
- [ ] Act BAN_USER: sets User.status = BANNED; flag → REVIEWED; AuditLog written; all in one transaction
- [ ] Act REMOVE_LISTING: sets Listing.status = REMOVED; flag → REVIEWED; AuditLog written
- [ ] Acting on already-REVIEWED or DISMISSED flag returns an error (no double-action)
- [ ] HIGH flag automatically creates a SupportTicket "AUTO-FLAG HIGH: <reason>"
- [ ] Normal listing (fair price, established seller) produces zero fraud flags
- [ ] Absent `ANTHROPIC_API_KEY` → AI checks skip silently, no crash, Sentry capture called
- [ ] Fraud checks never block listing creation / payment event / message persist
- [ ] `scripts/qa-step18.ts` reports all tests passed
- [ ] `typecheck`/`lint`/`build` pass; mobile responsive admin fraud queue
- [ ] Step 18 ticked in `docs/ROADMAP.md`; key choices logged in `docs/DECISIONS.md`
- [ ] Final Status: ✅ Pass

---

## 👉 After this step
Tell me **"Step 18 done"** → Step 19 — Auto-delivery (INSTANT listings deliver account credentials
automatically after payment confirmed, no seller action needed).

## 🔑 Tokens needed: **`ANTHROPIC_API_KEY`** (from Step 16 — already in `.env`).
