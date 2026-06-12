import { describe, it, expect } from "vitest";
import {
  computeBuyerFee,
  computeSellerCommissionMinor,
  computeSellerCommissionMinorForLevel,
  effectiveSellerCommissionPct,
  computeBoostFeeMinor,
  computeInstantPayoutFeeMinor,
} from "@/lib/fees";
import { siteConfig } from "@/config/site";

/**
 * Fee math is the money core (guardrails §1): integer minor units, round-half-up,
 * no floats. We assert against siteConfig where the value is config-driven (so
 * the test tracks the single source of truth) AND pin the rounding/floor/clamp
 * behaviour with hand-computed cases.
 */
describe("computeBuyerFee", () => {
  it("adds the platform fee to the subtotal", () => {
    const pct = siteConfig.fees.buyerPlatformFeePercent;
    const r = computeBuyerFee(100_000, 1);
    expect(r.subtotalMinor).toBe(100_000);
    expect(r.platformFeeMinor).toBe(Math.floor((100_000 * pct + 50) / 100));
    expect(r.totalMinor).toBe(r.subtotalMinor + r.platformFeeMinor);
    expect(r.platformFeePercent).toBe(pct);
  });

  it("multiplies by quantity and clamps qty to >= 1", () => {
    const three = computeBuyerFee(50_000, 3);
    expect(three.subtotalMinor).toBe(150_000);
    const zero = computeBuyerFee(50_000, 0);
    expect(zero.subtotalMinor).toBe(50_000); // clamped to 1
    const neg = computeBuyerFee(50_000, -5);
    expect(neg.subtotalMinor).toBe(50_000);
  });

  it("rounds the fee half-up (integer math, never a float)", () => {
    // 5% of 1 paisa = 0.05 → (1*5+50)/100 = 0 (half-up at .5 boundary is exact here)
    // Pick a value whose raw fee has a .5 remainder: subtotal=10, pct=5 → 50/100=0.5 → floor((50+50)/100)=1
    const r = computeBuyerFee(10, 1);
    expect(Number.isInteger(r.platformFeeMinor)).toBe(true);
    expect(r.platformFeeMinor).toBe(Math.max(
      Math.floor((10 * siteConfig.fees.buyerPlatformFeePercent + 50) / 100),
      siteConfig.fees.minPlatformFeeMinor,
    ));
  });

});

describe("computeSellerCommissionMinor", () => {
  it("uses the per-category-kind rate", () => {
    for (const kind of ["ACCOUNT", "ITEM", "CURRENCY", "BOOSTING"] as const) {
      const pct = siteConfig.fees.sellerCommissionPercent[kind];
      expect(computeSellerCommissionMinor(200_000, kind)).toBe(
        Math.floor((200_000 * pct + 50) / 100),
      );
    }
  });
});

describe("effectiveSellerCommissionPct", () => {
  it("subtracts the level discount, never below 0", () => {
    expect(effectiveSellerCommissionPct(8, "BRONZE")).toBe(8);
    expect(effectiveSellerCommissionPct(8, "GOLD")).toBe(6.5); // -1.5
    expect(effectiveSellerCommissionPct(8, "ELITE")).toBe(3); // -5
    expect(effectiveSellerCommissionPct(0.2, "ELITE")).toBe(0); // clamped
    expect(effectiveSellerCommissionPct(8, "UNKNOWN")).toBe(8); // no discount
  });
});

describe("computeSellerCommissionMinorForLevel", () => {
  it("applies level + PRO discounts and floors at 1%", () => {
    const base = siteConfig.fees.sellerCommissionPercent.ACCOUNT;
    // BRONZE FREE → just the base rate
    expect(computeSellerCommissionMinorForLevel(100_000, "ACCOUNT", "BRONZE")).toBe(
      Math.floor((100_000 * base + 50) / 100),
    );
    // ELITE + PRO can't drop below 1%
    const elitePro = computeSellerCommissionMinorForLevel(100_000, "ACCOUNT", "ELITE", "PRO");
    expect(elitePro).toBe(Math.floor((100_000 * 1 + 50) / 100));
  });
});

describe("flat fees", () => {
  it("boost daily vs weekly", () => {
    expect(computeBoostFeeMinor("daily")).toBe(siteConfig.fees.boost.dailyFeeMinor);
    expect(computeBoostFeeMinor("weekly")).toBe(siteConfig.fees.boost.weeklyFeeMinor);
  });
  it("instant payout = max(percent, floor)", () => {
    const { feePercent, minFeeMinor } = siteConfig.payouts.instant;
    expect(computeInstantPayoutFeeMinor(1000)).toBe(minFeeMinor); // floor wins
    const big = 5_000_000;
    expect(computeInstantPayoutFeeMinor(big)).toBe(
      Math.max(Math.floor((big * feePercent + 50) / 100), minFeeMinor),
    );
  });
});
