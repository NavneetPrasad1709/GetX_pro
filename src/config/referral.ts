/**
 * Referral engine config (Prompt 22). Single source of truth for reward rates —
 * never hardcode amounts in services or components.
 *
 * Reward currency is FEE_CREDIT (minor units, accrued to User.referralCreditMinor)
 * until Step 21 loyalty points ship; the amounts below are in paise (₹). The
 * referee gets a small signup credit immediately; the referrer's (larger) reward
 * is DEFERRED to the referee's first COMPLETED order (the fraud gate). The seller
 * invite carries a higher referrer reward (supply is the scarce side).
 */
export const referralConfig = {
  codeLength: 8, // A-Z0-9 share code
  // Reward amounts in minor units (paise). 2_500 = ₹25.
  buyer: {
    refereeSignupMinor: 2_500, // referee: ₹25 welcome credit at signup
    referrerRewardMinor: 5_000, // referrer: ₹50 when the referee's first order completes
  },
  seller: {
    refereeSignupMinor: 5_000, // ₹50
    referrerRewardMinor: 12_500, // ₹125 — supply-side is 2.5× (Airbnb host-referral precedent)
  },
} as const;
