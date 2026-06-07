# GETX — Fees & Pricing (single source of truth)

> All fee logic MUST follow this file. Rates are **configurable** (config/DB), never hardcoded.
> All money in **integer minor units** (paisa/cents). Rounding = **round-half-up to nearest minor unit**.
> Owner-confirmed source: pricing table provided 2026-06-05.

## Fee table

| Fee | Paid by | Rate | Calculated on | When | Notes |
|---|---|---|---|---|---|
| Category commission — Game Accounts | Seller | **8%** | Order subtotal | Deducted at payout (on completion) | seller commission |
| Category commission — Boosting | Seller | **6%** | Order subtotal | Deducted at payout (on completion) | seller commission |
| Category commission — Items | Seller | **8%** *(proposed — confirm)* | Order subtotal | Deducted at payout | needs owner confirm |
| Category commission — Currency | Seller | **7%** *(proposed — confirm)* | Order subtotal | Deducted at payout | needs owner confirm |
| Platform fee | Buyer | **5%** | Order subtotal | At checkout | GETX revenue |
| Payment processing | Buyer (pass-through) | gateway actual | Payment amount | At checkout | varies by UPI/card/crypto; show clearly |
| Withdrawal / payout | Seller | pass-through only (no GETX fee) | Withdrawal amount | At withdrawal | only bank/provider charge; finalize on platform access |
| Refund / dispute | case by case | per policy below | dispute outcome | when processed | see matrix |

## Configurable shape (put in config or a `FeeConfig` table)
```ts
fees = {
  sellerCommissionPercent: { ACCOUNT: 8, BOOSTING: 6, ITEM: 8, CURRENCY: 7 }, // confirm ITEM/CURRENCY
  buyerPlatformFeePercent: 5,
  minPlatformFeeMinor: 0,          // optional floor for tiny orders
  rounding: "HALF_UP",
  paymentProcessing: "PASS_THROUGH" // actual gateway cost added to buyer
}
```

## Worked example — ₹1,000 Game Account order
- **Subtotal:** ₹1,000 (100000 minor)
- **Buyer pays at checkout:** 1000 + platform 5% (₹50) + processing (e.g. UPI ≈ ₹20) = **₹1,070**
- **Seller receives:** 1000 − commission 8% (₹80) = **₹920**
- **GETX revenue:** 50 (buyer platform fee) + 80 (seller commission) = **₹130** (processing is pass-through, not GETX's)
- **Effective take rate:** 13% of subtotal

## Escrow money flow (recommended — full buyer protection)
1. Buyer pays ₹1,070 → gateway keeps processing (₹20) → **₹1,050 nets to platform**.
2. **Escrow holds ₹1,050** = subtotal + buyer platform fee (held, not released).
   - Ledger: `ESCROW_HOLD` 1050 (against the order).
3. On **completion** (buyer confirms or 3-day auto-release), one transaction:
   - `ESCROW_RELEASE` (debit hold) 1050
   - `SALE` (credit seller wallet) **920**
   - `FEE` (platform fee revenue) **50**
   - `FEE` (commission revenue) **80**
   - Check: 920 + 50 + 80 = 1050 ✓
4. Seller withdraws ₹920 later (payout = pass-through cost only).

> Why hold subtotal + platform fee (not just subtotal): so a refund can return both to the buyer
> → stronger "money-back" trust (our core USP).

## Refund / dispute policy (PROPOSED — owner to confirm)

| Outcome | Buyer gets back | Seller gets | Who absorbs gateway processing |
|---|---|---|---|
| Refund approved (seller fault / not delivered) | Subtotal + platform fee (₹1,050) | ₹0 | Gateway processing (₹20) is non-refundable by gateway → **GETX absorbs** (goodwill) *(confirm)* |
| Dispute rejected (buyer wrong) | ₹0 | Full release as normal | n/a |
| Partial / mutual | per admin/AI decision (split) | per decision | per decision |
| Buyer cancels before payment | n/a (no charge) | n/a | n/a |

Rules:
- All refunds go through the escrow/ledger services in a transaction (reverse the hold).
- Gateway processing fee is generally **not** returned by the gateway; policy decides who eats it.
- AI Dispute Judge (Step 25) will apply these same rules automatically; admins handle edge cases.

## Open items to confirm
1. Items commission % (proposed 8%) and Currency commission % (proposed 7%).
2. On approved refund, who absorbs the gateway processing fee — GETX (goodwill) or buyer?
3. Minimum platform fee for very small orders? (proposed: none / 0)
