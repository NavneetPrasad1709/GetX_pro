# STEP 10 — Escrow + Delivery + Buyer Protection + Auto-release

> Goal: The trust engine. Seller delivers → buyer confirms (or 3-day auto-release via Vercel Cron)
> → funds move from escrow hold to seller wallet (ledger). Refund + dispute paths. Guardrails §1, §4.

---

## PROMPT (copy from here ⬇️)

You are the CTO + Senior Backend Developer of GETX. Read `CLAUDE.md` +
`docs/ENGINEERING-GUARDRAILS.md` (§1 ledger, §3 states, §4 escrow). Work in `D:\GetX`.
This is **Step 10 — Escrow + delivery**. Talk Hinglish. Follow the full workflow.

### Task
1. **Escrow service** (`src/server/services/escrow.ts`), all changes in `prisma.$transaction`:
   - On `PAID` (from Step 09) funds already recorded as `ESCROW_HOLD` (= subtotal + buyer platform fee,
     per `docs/FEES.md`).
   - `markDelivered(orderId, sellerId)` → Order `DELIVERED`, set `deliveredAt`, `autoReleaseAt = now + 3 days`.
   - `confirmReceipt(orderId, buyerId)` → release per `docs/FEES.md`, in ONE transaction:
     `ESCROW_RELEASE` (debit hold) + `SALE` (credit seller = subtotal − category commission) +
     `FEE` (platform fee revenue) + `FEE` (commission revenue). Sum must reconcile. Order `COMPLETED`.
     Update seller totals (totalSales, etc.).
   - `refund(orderId, reason)` → reverse hold → Order `REFUNDED` (used by dispute/admin).
2. **Seller deliver UI**: on a `PAID` order, seller submits delivery (account creds/code/notes;
   for now text + later attachments via R2). Marks `DELIVERED`.
3. **Buyer confirm UI**: on a `DELIVERED` order, buyer sees a 3-day countdown + "Confirm received"
   (releases now) and "Open dispute" (Step 15 handles resolution; here just set `DISPUTED` + freeze release).
4. **Auto-release Cron** (`/api/cron/auto-release` + `vercel.json` cron, e.g. every 15 min):
   find `DELIVERED` orders with `autoReleaseAt <= now` and not disputed → release each (idempotent).
   Secure the cron endpoint (secret header / Vercel cron auth).
5. **Wallet balance** = derived from ledger (sum). Show seller available balance on dashboard.
6. **Edge cases**: double confirm, release already-released, dispute after delivered, refund after
   release (block), cron running twice (idempotent), seller delivering non-PAID order (block).

### Rules
- Every money move = ledger entries inside one transaction. Idempotent release (never double-pay).
- Validate role + ownership on deliver/confirm. Cron endpoint must be protected.

### Report back
CLAUDE.md output format + QA CHECKLIST below.

---

## ✅ QA CHECKLIST
- [ ] Full happy path: PAID → seller delivers → buyer confirms → seller wallet credited (minus fee) → COMPLETED
- [ ] Ledger entries correct (ESCROW_HOLD → ESCROW_RELEASE + SALE − FEE); balance = sum matches
- [ ] 3-day auto-release cron releases overdue DELIVERED orders; running cron twice = no double pay
- [ ] Dispute freezes release; refund reverses hold correctly
- [ ] Cron endpoint rejects unauthorized calls
- [ ] Double/again actions are idempotent; non-owner blocked
- [ ] `typecheck`/`lint`/`build` pass; mobile responsive
- [ ] Step 10 ticked; DECISIONS updated
- [ ] Final Status: ✅ Pass

---

## 👉 After this step
Run a full buy→deliver→confirm cycle on test data. Tell me **"Step 10 done"** → Step 11 (Chat).

## 🔑 Tokens needed: **None** (Vercel Cron config now; activates on deploy).
