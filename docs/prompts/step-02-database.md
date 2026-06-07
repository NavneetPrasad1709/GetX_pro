# STEP 02 — Database Schema + Neon + Migrate + Seed

> Goal: Design the full marketplace database (Prisma), connect Neon, migrate, and seed 5 games.
> This is the backbone — get it right. Follow `docs/ENGINEERING-GUARDRAILS.md` (money = ledger).

---

## PROMPT (copy from here ⬇️)

You are the CTO + Senior Database Architect of GETX. Read `CLAUDE.md`,
`docs/ENGINEERING-GUARDRAILS.md`, and `docs/STRATEGY.md` first. Work in `D:\GetX`.
This is **Step 02 — Database schema + Neon + seed**. Talk Hinglish. Follow the full workflow.

### Task
1. **Design `prisma/schema.prisma`** for the marketplace. Money = integer minor units everywhere.
   Models (add fields/indexes/relations/constraints sensibly):
   - `User` — email (unique), passwordHash?, name, image?, role enum `BUYER|SELLER|ADMIN`,
     emailVerified?, createdAt. Auth.js tables (`Account`, `Session`, `VerificationToken`).
   - `SellerProfile` — 1:1 with User, displayName, bio, country, kycStatus enum
     `NONE|PENDING|APPROVED|REJECTED`, trustScore Int default, totalSales Int, ratingAvg, ratingCount.
   - `Game` — name, slug (unique), iconUrl, bannerUrl, isActive, sortOrder.
   - `Category` — name, slug, gameId, kind enum `ACCOUNT|ITEM|CURRENCY|BOOSTING`.
   - `Listing` — sellerId, gameId, categoryId, title, slug, description, type (same enum),
     priceMinor Int, currency, stock Int, deliveryType enum `MANUAL|INSTANT`, attributes Json,
     status enum `DRAFT|ACTIVE|PAUSED|SOLD|REMOVED`, images String[], createdAt. Index gameId, sellerId, status, priceMinor.
   - `Order` — buyerId, sellerId, listingId, qty, unitPriceMinor, feeMinor, totalMinor, currency,
     status enum (`DRAFT|AWAITING_PAYMENT|UNDERPAID|PAID|DELIVERED|COMPLETED|DISPUTED|REFUNDED|CANCELLED|EXPIRED`),
     paymentProvider?, deliveredAt?, autoReleaseAt?, createdAt. Index buyerId, sellerId, status, autoReleaseAt.
   - `Payment` — orderId, provider enum `COINGATE|RAZORPAY`, providerRef, amountMinor, currency,
     status enum `PENDING|CONFIRMED|UNDERPAID|EXPIRED|FAILED`, raw Json?, createdAt.
   - `ProcessedWebhook` — provider, providerEventId (UNIQUE), createdAt. (idempotency)
   - `Wallet` — 1:1 SellerProfile, cachedBalanceMinor Int default 0, currency.
   - `LedgerEntry` — walletId, orderId?, type `CREDIT|DEBIT`, reason
     `SALE|FEE|REFUND|PAYOUT|ESCROW_HOLD|ESCROW_RELEASE`, amountMinor Int, balanceAfterMinor Int, createdAt. Index walletId.
   - `Payout` — walletId, amountMinor, method enum `RAZORPAY|CRYPTO`, status enum `REQUESTED|PROCESSING|PAID|FAILED`, providerRef?, createdAt.
   - `Review` — orderId (unique), buyerId, sellerId, rating Int(1-5), comment, createdAt.
   - `Conversation` — orderId?, buyerId, sellerId, createdAt. `Message` — conversationId, senderId, body, readAt?, createdAt.
   - `Dispute` — orderId (unique), openedById, reason, status enum `OPEN|RESOLVED_BUYER|RESOLVED_SELLER|CLOSED`, resolutionNote?, createdAt.
   - `KycSubmission` — sellerId, docType, docUrl (private R2 key), status enum `PENDING|APPROVED|REJECTED`, reviewedBy?, createdAt.
   - `Notification` — userId, type, title, body, readAt?, createdAt.
   - `AuditLog` — actorId?, action, entity, entityId, meta Json, createdAt.
2. **Connect Neon**: set `DATABASE_URL` (pooled) + `DIRECT_URL` (direct) in `.env.local`.
   In `schema.prisma` datasource use `url = env("DATABASE_URL")` and `directUrl = env("DIRECT_URL")`.
3. **Migrate**: run `prisma migrate dev --name init`. Fix any errors. Run `prisma generate`.
4. **Seed `prisma/seed.ts`**: 5 games (Pokemon GO, Clash of Clans, Valorant, Free Fire, PUBG Mobile)
   each with a few categories; 1 admin user; 2 demo sellers (with wallets) + 4 demo listings;
   1 demo buyer. Make seed **idempotent** (upsert). Wire `npm run db:seed` and run it.
5. Update `docs/FOLDER-STRUCTURE.md` if anything new; tick Step 02 in ROADMAP; log notes in DECISIONS.

### Rules
- Money fields end in `Minor` and are `Int`. Follow the ledger rule (don't add logic yet, just the models).
- Use enums for every status. Add `@@index` on FKs + filter/sort columns.
- No raw SQL unless necessary. No business logic yet — schema + seed only.

### Report back
Use the CLAUDE.md output format + the QA CHECKLIST below.

---

## ✅ QA CHECKLIST
- [ ] `prisma migrate dev` succeeds; `prisma generate` clean
- [ ] `npm run typecheck` → 0 errors
- [ ] All models above exist with enums, relations, and indexes
- [ ] Money fields are `Int` minor units (no Float/Decimal for money)
- [ ] `DATABASE_URL` = Neon **pooled**, `DIRECT_URL` = **direct** (both in `.env.local`, gitignored)
- [ ] `npm run db:seed` inserts 5 games + demo data; re-running it does NOT duplicate (idempotent)
- [ ] `npm run db:studio` opens and shows the seeded data
- [ ] Step 02 ticked in ROADMAP; DECISIONS updated
- [ ] Final Status: ✅ Pass

---

## 👉 After this step
Run `npm run db:studio` to see your tables. Then tell me **"Step 2 done"** → Step 03 (Auth + roles).

## 🔑 Tokens needed for THIS step
**Neon connection strings** (pooled + direct). FREE. How to get:
1. neon.tech pe sign up (GitHub se 1-click).
2. New Project banao → region apne market ke paas (India ke liye Singapore/Mumbai).
3. Dashboard → "Connection string" → **Pooled connection** copy karo = `DATABASE_URL`.
4. Toggle off pooling (ya "Direct connection") copy karo = `DIRECT_URL`.
5. Dono mujhe do (ya `.env.local` me daal do) — main migrate kar dunga.
