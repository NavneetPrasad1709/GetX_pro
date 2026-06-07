/**
 * Buyer-side fee math — the ONE place the buyer platform fee is computed.
 *
 * Follows docs/FEES.md: the buyer pays the subtotal + a platform fee
 * (`siteConfig.fees.buyerPlatformFeePercent`, default 5%) at checkout.
 * Rates are configurable (siteConfig), never hardcoded; everything is integer
 * minor units (paisa/cents) and rounding is ROUND-HALF-UP — pure integer math,
 * no floats (guardrails §1).
 *
 * This is intentionally pure + dependency-light so it runs on BOTH the client
 * (live total preview in the buy box) and the server (checkout/escrow, Step 08+).
 * Payment-processing pass-through is NOT included here — its real cost is only
 * known at checkout once a gateway is chosen (Step 09); the buy box shows it as
 * a separate "added at checkout" line.
 */
import { siteConfig } from "@/config/site";

export type BuyerFeeBreakdown = {
  /** unit price × quantity (minor units) */
  subtotalMinor: number;
  /** buyer platform fee on the subtotal (minor units, round-half-up) */
  platformFeeMinor: number;
  /** subtotal + platform fee (minor units) — the buyer's checkout total
   *  BEFORE gateway processing pass-through (added at checkout). */
  totalMinor: number;
  /** the fee rate used (percent) — for "5% platform fee" copy */
  platformFeePercent: number;
};

/**
 * Round-half-up division by 100 using pure integer arithmetic.
 * `(value * percent)` is an integer; `+ 50` then integer-divide by 100 rounds
 * a trailing .5 UP (never the float .toFixed/Math.round half-to-even surprise).
 */
function percentOfMinorHalfUp(amountMinor: number, percent: number): number {
  return Math.floor((amountMinor * percent + 50) / 100);
}

/**
 * Compute the buyer's fee + total for an order of `qty` units at `unitPriceMinor`.
 * Quantity is clamped to ≥ 1; callers validate stock separately.
 */
export function computeBuyerFee(
  unitPriceMinor: number,
  qty = 1,
): BuyerFeeBreakdown {
  const { buyerPlatformFeePercent, minPlatformFeeMinor } = siteConfig.fees;
  const quantity = Math.max(1, Math.floor(qty));
  const subtotalMinor = unitPriceMinor * quantity;

  const rawFee = percentOfMinorHalfUp(subtotalMinor, buyerPlatformFeePercent);
  const platformFeeMinor = Math.max(rawFee, minPlatformFeeMinor);

  return {
    subtotalMinor,
    platformFeeMinor,
    totalMinor: subtotalMinor + platformFeeMinor,
    platformFeePercent: buyerPlatformFeePercent,
  };
}
