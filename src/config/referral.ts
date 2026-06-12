/**
 * Referral engine config (Prompt 22). Single source of truth for reward rates —
 * never hardcode amounts in services or components.
 *
 * Reward currency is FEE_CREDIT (minor units, accrued to User.referralCreditMinor)
 * until Step 21 loyalty points ship; the amounts below are in USD cents. The
 * referee gets a small signup credit immediately; the referrer's (larger) reward
 * is DEFERRED to the referee's first COMPLETED order (the fraud gate). The seller
 * invite carries a higher referrer reward (supply is the scarce side).
 */
export const referralConfig = {
  codeLength: 8, // A-Z0-9 share code
  // Reward amounts in minor units (USD cents). 200 = $2 (O-T1).
  buyer: {
    refereeSignupMinor: 200, // referee: $2 welcome credit at signup
    referrerRewardMinor: 300, // referrer: $3 when the referee's first order completes
  },
  seller: {
    refereeSignupMinor: 200, // $2 welcome credit
    referrerRewardMinor: 500, // $5 — supply-side reward is higher (scarce side)
  },
} as const;
