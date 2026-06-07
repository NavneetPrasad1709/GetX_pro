# STEP 08 — Checkout + Order Creation (state machine)

> Goal: Turn "Buy Now" into a safe order in `AWAITING_PAYMENT`. Server recomputes everything.
> Payment provider integration is Step 09 — here we build the order + state machine. Guardrail §3.

---

## PROMPT (copy from here ⬇️)

You are the CTO + Senior Backend Developer of GETX. Read `CLAUDE.md` +
`docs/ENGINEERING-GUARDRAILS.md` (§3 order state machine, §1 money). Work in `D:\GetX`.
This is **Step 08 — Checkout + order creation**. Talk Hinglish. Follow the full workflow.

### Task
1. **Order state machine service** (`src/server/services/orders.ts`): define allowed transitions
   per guardrail §3. Export `createOrder`, `transitionOrder` (rejects illegal transitions),
   `getOrder`. All money recomputed server-side from the DB listing (NEVER trust client price).
2. **Checkout page** (`/checkout/[listingId]` or order-based): order summary per **`docs/FEES.md`** —
   show subtotal, **buyer platform fee (5%)**, **payment processing (pass-through, shown clearly)**,
   and final total. (Seller commission is NOT shown to buyer — it's deducted from the seller at payout.)
   Buyer must be logged in (else login redirect); choose payment method (CoinGate / Razorpay — buttons;
   actual charge in Step 09).
3. **Create order**: Server Action creates `Order` as `AWAITING_PAYMENT` with fees computed per
   `docs/FEES.md` (minor units, round-half-up): `feeMinor` (buyer platform fee), processing,
   `totalMinor`, and store the seller commission rate for that category for payout time.
   Decrement/hold stock appropriately, set `autoReleaseAt` later (after delivery).
   Make creation **idempotent** (avoid double order on double click).
4. **Order confirmation / pending page** (`/orders/[id]`): shows status, what happens next
   ("pay to lock in escrow"), and a placeholder "Pay now" that Step 09 will wire to the provider.
5. **Buyer orders list** (`(dashboard)/orders`): buyer's orders with status badges + links.
6. **Edge cases**: listing sold/paused/removed, out of stock, buying own listing (block), qty limits.

### Rules
- Server recomputes price + fee from DB. Reject client-supplied totals.
- Use `prisma.$transaction` for order create + stock change. Idempotent creation.
- No real payment yet — just create the order and route to the pending/pay page.

### Report back
CLAUDE.md output format + QA CHECKLIST below.

---

## ✅ QA CHECKLIST
- [ ] Buy Now → checkout → creates order in `AWAITING_PAYMENT` with correct fee + total
- [ ] Server ignores any client-tampered price (test by tampering) — recomputes from DB
- [ ] Double-click does NOT create two orders (idempotent)
- [ ] Cannot buy own listing / sold / out-of-stock (clear errors)
- [ ] Illegal status transitions are rejected by the service
- [ ] Buyer orders list + order page show correct status; mobile responsive
- [ ] `typecheck`/`lint`/`build` pass
- [ ] Step 08 ticked; DECISIONS updated
- [ ] Final Status: ✅ Pass

---

## 👉 After this step
Create a test order. Tell me **"Step 8 done"** → Step 09 (Payments: CoinGate + Razorpay).

## 🔑 Tokens needed: **None** (next step needs payment keys).
