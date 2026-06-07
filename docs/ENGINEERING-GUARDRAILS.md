# GETX — Engineering Guardrails (senior-dev rules)

> These are the non-obvious rules that prevent expensive bugs (lost money, security holes).
> CLAUDE.md links here. Read the relevant rule before building that feature.

---

## 1. Money = append-only LEDGER (most important)

❌ Wrong: `seller.balance += amount` (one bug = wrong money, no history).
✅ Right: every money movement is a row in `LedgerEntry`. Balance = SUM of rows.

```
LedgerEntry {
  id, walletId, orderId?, type (CREDIT|DEBIT),
  reason (SALE|REFUND|PAYOUT|FEE|ESCROW_HOLD|ESCROW_RELEASE),
  amount Int,            // minor units (paisa/cents), always positive
  balanceAfter Int,      // snapshot for audit
  createdAt
}
```
- All amounts **integer minor units**. Never float, never decimals for money.
- Wallet balance = `sum(CREDIT) - sum(DEBIT)`. Cache it if needed, but ledger is the truth.
- Every ledger write happens **inside the same DB transaction** as the action causing it.

## 2. Payment webhooks = idempotent + signature-verified

Providers (CoinGate, Razorpay) can send the same webhook **multiple times / out of order**.
- **Verify the signature** first (reject fakes). Use the provider's documented HMAC check.
- **Dedupe**: store `ProcessedWebhook { providerEventId @unique }`. If already seen → return 200, do nothing.
- Make the handler **idempotent**: running it twice must not create two payouts / two escrow holds.
- Do all state changes in **one DB transaction** with the dedupe insert.

## 3. Orders = explicit state machine

```
DRAFT → AWAITING_PAYMENT → (UNDERPAID) → PAID → DELIVERED → COMPLETED
                          ↘ EXPIRED      ↘ DISPUTED → REFUNDED / COMPLETED
                                          ↘ CANCELLED
```
- Define allowed transitions in one service (`src/server/services/orders.ts`). Reject illegal jumps.
- **Crypto is not instant:** handle `AWAITING_PAYMENT` (waiting for confirmations), `UNDERPAID`
  (paid less), `EXPIRED` (no payment in time), `PAID` (confirmed). Show clear status to the buyer.

## 4. Escrow lifecycle

1. Buyer pays → funds recorded as `ESCROW_HOLD` (held, not seller's yet).
2. Seller delivers → order `DELIVERED`.
3. Buyer confirms OR 3-day timer passes (Vercel Cron sweep) → `ESCROW_RELEASE` (credit seller wallet).
4. Buyer disputes within window → freeze release → admin/AI decides → release or `REFUND`.
- The 3-day auto-release = a cron job that finds `DELIVERED` orders past their deadline and releases them.
  Model it as **deadline timestamp + periodic sweep**, not a one-off scheduled job.

## 5. Database (Neon + Prisma) — connection pooling

- App (serverless on Vercel) uses the **pooled** connection string (Neon pgbouncer) as `DATABASE_URL`.
- Prisma **migrations** use the **direct** connection as `DIRECT_URL`.
- Always import the **singleton** from `src/lib/db.ts`. Never `new PrismaClient()` in routes.
- Add DB indexes on every foreign key + every column you filter/sort by (gameId, sellerId, status, price).
- Use `prisma.$transaction(...)` for any multi-write money/order operation.

## 6. Files & KYC (Cloudflare R2)

- Upload **direct browser → R2** via **presigned URLs** (don't stream big files through Next API).
- Validate type + size **server-side** before issuing the presigned URL.
- Listing images = public bucket OK. **KYC docs / IDs = PRIVATE bucket**, read via short-lived signed
  URLs only, restricted to admins, and log every access.

## 7. Auth & authorization

- **Auth.js (NextAuth v5) + Prisma adapter.** Passwords hashed with bcrypt/argon2 (never plaintext).
- Email verification before selling. Cloudflare Turnstile on signup/login.
- On **every** protected action: check (a) logged in, (b) correct role, (c) owns the resource.
  Make a helper: `requireUser()`, `requireRole('SELLER')`, `assertOwner(resource, user)`.
- Rate-limit auth, payment, and write endpoints (IP + user based).

## 8. Validation & errors

- One **Zod** schema per input, used on client (form) and server (action/route). Re-validate on server always.
- Never trust client-sent prices/amounts — recompute on the server from the DB.
- Every feature ships with: error state, loading state, empty state, edge-case handling.

## 9. Security baseline

- Secrets only in `.env.local` (gitignored). Never hardcode. `.env.example` keeps keys only.
- Verify all webhook signatures. Never `dangerouslySetInnerHTML` with user content.
- CSRF: use Server Actions / same-site cookies. Set secure cookie flags in prod.

## 10. Observability & testing

- Wire **Sentry** at the payments step (Step 09) — never run payments blind.
- Write tests for the **critical money paths**: order creation, webhook handling, escrow release, payout.
  These are where bugs cost real money.

---

> Rule of thumb: if it touches **money, auth, or user data**, slow down, use a transaction,
> validate on the server, and write a test. Everywhere else, move fast.
