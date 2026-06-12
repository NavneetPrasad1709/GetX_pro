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

    // Opt-in monetization (Prompt 15) — additive, never raises the base take.
    // Featured/"Promoted" listing placement (Stream 1/2). Minor units.
    boost: {
      dailyFeeMinor: 20_000, // ₹200/day
      weeklyFeeMinor: 100_000, // ₹1,000/7 days (~₹143/day, 28% cheaper)
      maxFeaturedPerPage: 2, // promoted slots shown per page (cap pay-to-win)
      maxActiveFeaturedPerSeller: 3, // a seller can boost ≤3 listings at once
      homepageMinRating: 4.0, // boosted listings reach the homepage only at/above this
      // Listing "bump" (Stream 7) — one-time recency reset for the newest sort.
      bumpFeeMinor: 9_900, // ₹99 per bump
      maxBumpsPerDay: 3, // per listing, sliding 24h window
    },
    // GETX Pro seller subscription (Stream 4). Listings are unlimited for all
    // tiers (O-T5) — Pro sells commission discount + badge + support + analytics.
    subscription: {
      proMonthlyFeeMinor: 49_900, // ₹499/month
      proCommissionDiscount: 2, // percentage POINTS off base commission
    },
    // Spotlight sponsorship (Stream 3) — scarce, quality-gated weekly slot.
    sponsorship: {
      weeklyFeeMinor: 250_000, // ₹2,500/week
      maxSponsoredSellers: 3, // total slots (scarcity = value)
      minRatingForSponsorship: 4.0, // quality gate
      minSalesForSponsorship: 5, // must have ≥5 completed sales
    },
  },

  // Escrow / buyer protection (see docs/ENGINEERING-GUARDRAILS.md §4). Client-safe
  // config so UI copy + the escrow service share ONE source of truth.
  escrow: {
    // Days after delivery before funds auto-release to the seller (Vercel Cron).
    autoReleaseDays: 3,
  },

  // Marketplace liquidity (Prompt 12). Referenced by the stale-pause cron, the
  // liquidity service, and the listing-create action — never hardcoded.
  liquidity: {
    staleListingDays: 60, // ACTIVE listings auto-paused after this much inactivity
    newSellerBoostDays: 7, // new-seller search-visibility boost duration
    newSellerBoostMaxSales: 10, // boost only applies below this totalSales threshold
  },

  // Seller payouts / withdrawals (Step 14). Minor units (paise).
  payouts: {
    minPayoutMinor: 50_000, // ₹500 minimum withdrawal
    maxPayoutMinor: 1_000_000_00, // ₹10,00,000 sanity cap per request
    // Instant payout fast-track (Prompt 15b, Stream 6).
    instant: {
      feePercent: 1, // 1% of payout amount
      minFeeMinor: 5_000, // ₹50 floor
    },
  },

  // Operations / work-queue (Prompt 24). SLA resolution windows in HOURS per ticket type,
  // plus the priority thresholds. The breach cron + ops dashboard read these — never hardcode.
  ops: {
    slaHours: {
      DISPUTE: 48,
      KYC: 72,
      FRAUD_FLAG: 24,
      PAYOUT_REVIEW: 24,
      SUPPORT: 24,
    },
    // Disputes on orders at/above this amount (minor units) open as HIGH priority.
    highValueDisputeMinor: 5_000_000, // ₹50,000
    queuePageSize: 30,
  },

  // Notifications (Step 22). Shared by the bell, the notification service, and actions.
  notifications: {
    feedPageSize: 10, // how many notifications the bell dropdown loads at once
    badgeMax: 99, // counts above this render as "99+"
    fromEmail: process.env.RESEND_FROM_EMAIL ?? "GETX <onboarding@resend.dev>",
    // Rate limit for "mark all read" (per user) — stops badge-clear spam.
    markAllReadLimit: 10,
    markAllReadWindowMs: 60_000,
  },
} as const;

export type SiteConfig = typeof siteConfig;
export type CategoryKind = keyof typeof siteConfig.fees.sellerCommissionPercent;
