/**
 * Central site config + constants for GETX.
 * Fees follow docs/FEES.md (single source of truth). Keep values here, not hardcoded in components.
 */
export const siteConfig = {
  name: "GETX",
  domain: "getx.live",
  description:
    "GETX — the fast, AI-powered, trust-first gaming marketplace. Buy & sell game accounts, items, in-game currency and boosting safely with escrow protection.",
  url: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",

  // Supported currencies (fiat + crypto)
  currencies: ["INR", "USDT", "BTC", "ETH"] as const,

  // Launch niche: start small (5 games), Pokemon GO first (see docs/STRATEGY.md)
  launchGames: [
    "Pokemon GO",
    "Clash of Clans",
    "Valorant",
    "Free Fire",
    "PUBG Mobile",
  ] as const,

  // Fee model — see docs/FEES.md. All percentages; money computed in minor units, round-half-up.
  fees: {
    // Seller commission % per category kind (deducted from seller payout on completion)
    sellerCommissionPercent: {
      ACCOUNT: 8,
      BOOSTING: 6,
      ITEM: 8, // proposed — confirm
      CURRENCY: 7, // proposed — confirm
    },
    // Buyer-side platform fee % (charged at checkout)
    buyerPlatformFeePercent: 5,
    // Optional floor for tiny orders (minor units); 0 = none
    minPlatformFeeMinor: 0,
    rounding: "HALF_UP",
    paymentProcessing: "PASS_THROUGH",
  },
} as const;

export type SiteConfig = typeof siteConfig;
export type CategoryKind = keyof typeof siteConfig.fees.sellerCommissionPercent;
