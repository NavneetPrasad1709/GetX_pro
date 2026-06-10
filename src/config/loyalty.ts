/**
 * Loyalty points config (Step 21) — single source of truth for every rate. Points are NOT money;
 * they're a separate append-only ledger. Redemption converts points to a paisa discount that comes
 * out of the buyer platform fee (so the seller's take + escrow reconciliation never change).
 */
export const LOYALTY_CONFIG = {
  BUYER_POINTS_PER_RUPEE: 0.1, // buyer earns 1 pt per ₹10 of subtotal
  SELLER_POINTS_PER_RUPEE: 0.05, // seller earns 1 pt per ₹20 of net received (after commission)
  SIGNUP_BONUS_POINTS: 50, // every new account
  POINT_VALUE_MINOR: 10, // 1 pt = 10 paise (₹0.10) → 100 pts = ₹10 discount
  MAX_REDEMPTION_PCT: 0.2, // ≤20% of subtotal (further capped by the platform fee at checkout)
} as const;

/** Points → paisa discount (integer minor units, floor). */
export function pointsToMinorUnits(points: number): number {
  return Math.max(0, Math.floor(points)) * LOYALTY_CONFIG.POINT_VALUE_MINOR;
}

/** Paisa amount → the most points it is worth (floor). */
export function minorUnitsToPoints(minor: number): number {
  return Math.max(0, Math.floor(minor / LOYALTY_CONFIG.POINT_VALUE_MINOR));
}

/** Buyer earn on a completed order: floor(subtotal_paise * 0.1 / 100) = 1 pt per ₹10. */
export function buyerEarnPoints(subtotalMinor: number): number {
  return Math.floor((Math.max(0, subtotalMinor) * LOYALTY_CONFIG.BUYER_POINTS_PER_RUPEE) / 100);
}

/** Seller earn on a completed order: floor(net_paise * 0.05 / 100) = 1 pt per ₹20. */
export function sellerEarnPoints(netMinor: number): number {
  return Math.floor((Math.max(0, netMinor) * LOYALTY_CONFIG.SELLER_POINTS_PER_RUPEE) / 100);
}

/** Max points redeemable against a subtotal under the 20% cap (before the platform-fee cap). */
export function subtotalRedemptionCapPoints(subtotalMinor: number): number {
  return Math.floor((Math.max(0, subtotalMinor) * LOYALTY_CONFIG.MAX_REDEMPTION_PCT) / LOYALTY_CONFIG.POINT_VALUE_MINOR);
}
