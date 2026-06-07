# STEP 09 — Payments (CoinGate crypto + Razorpay UPI) + Webhooks + Sentry

> Goal: Real payments via 2 providers, with idempotent + signature-verified webhooks that move the
> order to PAID and record an escrow hold in the ledger. Wire Sentry. THE most careful step.
> Read guardrails §1 (ledger), §2 (webhooks), §3 (crypto states) before coding.

---

## PROMPT (copy from here ⬇️)

You are the CTO + Senior Backend + Senior Security Engineer of GETX. Read `CLAUDE.md` and
`docs/ENGINEERING-GUARDRAILS.md` (§1, §2, §3, §9) fully. Work in `D:\GetX`.
This is **Step 09 — Payments + webhooks + Sentry**. Talk Hinglish. Follow the full workflow.
Read CoinGate + Razorpay official docs before integrating — do not guess their APIs.

### Task
1. **Payment provider abstraction** (`src/server/services/payments/`): an interface
   `createCharge(order)` + `verifyWebhook(req)` + `parseEvent(req)` with two implementations:
   - **CoinGate (crypto)**: create an order/charge, redirect buyer to pay; handle statuses
     `pending → confirming → paid`, plus `underpaid`, `expired`, `invalid`. Map to our Order states.
   - **Razorpay (UPI/INR)**: create order, checkout, handle success/failure.
2. **Pay flow**: from the order pending page (Step 08), "Pay now" calls the chosen provider, redirects
   to the hosted payment / opens checkout. On return, show pending/confirmed state (truth comes from webhook).
3. **Webhook routes** (`/api/webhooks/coingate`, `/api/webhooks/razorpay`):
   - **Verify signature** (reject if invalid).
   - **Idempotency**: insert into `ProcessedWebhook(providerEventId)` — if duplicate, return 200 + no-op.
   - On confirmed payment, in **one `prisma.$transaction`**: set Order `PAID`, create `Payment`
     record, and create a `LedgerEntry` `ESCROW_HOLD` (funds held, NOT seller's yet). Handle
     `underpaid`/`expired` → set matching Order status.
4. **Sentry**: install + init (Next.js). Wrap webhook + payment service in error capture. Add the
   DSN to env. Verify a test error reaches Sentry.
5. **Edge cases**: duplicate webhooks, out-of-order webhooks, underpaid, expired, provider timeout,
   user closes payment window, currency mismatch. All handled gracefully + logged.

### Rules
- Webhook = source of truth (not the redirect). Verify signature + dedupe + transaction. Idempotent.
- Money via ledger only (no balance mutation). Integer minor units. Server-side only.
- Never log secrets/card/crypto private data. Verify provider signatures.

### Report back
CLAUDE.md output format + QA CHECKLIST below (include how you tested webhooks).

---

## ✅ QA CHECKLIST
- [ ] CoinGate charge + Razorpay order both create and redirect/checkout correctly
- [ ] Webhook signature verified; invalid signature rejected
- [ ] Duplicate webhook (same event id) is a no-op (test by replaying) — no double escrow
- [ ] Confirmed payment → Order `PAID` + Payment row + `ESCROW_HOLD` ledger entry (one transaction)
- [ ] Underpaid / expired handled → correct Order status
- [ ] Sentry receives a test error
- [ ] No secrets logged; `.env` keys only; `typecheck`/`lint`/`build` pass
- [ ] Step 09 ticked; DECISIONS updated
- [ ] Final Status: ✅ Pass

---

## 👉 After this step
Do a test payment (provider sandbox/test mode). Tell me **"Step 9 done"** → Step 10 (Escrow + delivery + auto-release).

## 🔑 Tokens needed for THIS step
- **CoinGate**: account → API credentials (use **sandbox** first: sandbox.coingate.com).
- **Razorpay**: dashboard → API Keys (use **Test Mode** keys first) + webhook secret.
- **Sentry**: project → DSN (free tier).
Main test-mode keys se sab verify karunga, phir live keys deployment pe.
