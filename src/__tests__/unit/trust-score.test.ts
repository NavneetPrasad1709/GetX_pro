import { describe, it, expect } from "vitest";
import {
  computeTrustScore,
  computeRiskScore,
  resolveSellerLevel,
  SELLER_LEVELS,
  type TrustSignalInputs,
} from "@/server/services/trust-score";

/**
 * Trust + risk scoring are pure formulas (no DB). Cases below are hand-computed
 * against the real implementation (Math.round; a null reply-time scores the
 * neutral 10, NOT 0). Keep these in lockstep with src/server/services/trust-score.ts.
 */
const base: TrustSignalInputs = {
  completedOrders: 0,
  cancelledOrders: 0,
  disputedOrders: 0,
  ratingAvg: 0,
  ratingCount: 0,
  avgFirstReplyMinutes: null,
  accountAgeDays: 0,
  kycStatus: "NONE",
};

describe("computeTrustScore", () => {
  it("scores a near-perfect seller", () => {
    const r = computeTrustScore({
      ...base,
      completedOrders: 100,
      ratingAvg: 5,
      ratingCount: 50,
      avgFirstReplyMinutes: 10,
      accountAgeDays: 365,
      kycStatus: "APPROVED",
    });
    expect(r.breakdown).toEqual({
      completionRate: 30,
      ratingScore: 25,
      responseTime: 20,
      accountAge: 10,
      kycVerified: 10,
      disputePenalty: 0,
    });
    expect(r.total).toBe(95);
  });

  it("gives neutral defaults to a brand-new seller (null reply time → 10)", () => {
    const r = computeTrustScore({ ...base, accountAgeDays: 2 });
    expect(r.breakdown.completionRate).toBe(15); // no closed orders
    expect(r.breakdown.ratingScore).toBe(12); // no ratings
    expect(r.breakdown.responseTime).toBe(10); // null → neutral
    expect(r.breakdown.accountAge).toBe(1); // < 30 days
    expect(r.breakdown.kycVerified).toBe(0);
    expect(r.total).toBe(38);
  });

  it("applies the high-dispute penalty", () => {
    const r = computeTrustScore({
      ...base,
      completedOrders: 70,
      disputedOrders: 30, // 30% dispute rate → -15
      ratingAvg: 4,
      ratingCount: 20,
      avgFirstReplyMinutes: 200, // <=1440 → 8
      accountAgeDays: 100, // >=90 → 7
      kycStatus: "PENDING", // 3
    });
    expect(r.breakdown.completionRate).toBe(21); // round(0.7*30)
    expect(r.breakdown.ratingScore).toBe(20); // round(0.8*25)
    expect(r.breakdown.disputePenalty).toBe(-15);
    expect(r.total).toBe(44);
  });

  it("clamps to 0..100", () => {
    const r = computeTrustScore({ ...base, completedOrders: 1000, ratingAvg: 5, ratingCount: 1000, avgFirstReplyMinutes: 1, accountAgeDays: 9999, kycStatus: "APPROVED" });
    expect(r.total).toBeLessThanOrEqual(100);
    expect(r.total).toBeGreaterThanOrEqual(0);
  });
});

describe("computeRiskScore", () => {
  it("is low for an established clean seller", () => {
    expect(
      computeRiskScore({
        closedOrders: 100,
        disputedOrders: 0,
        accountAgeDays: 365,
        kycStatus: "APPROVED",
        completionRate: 0.98,
      }),
    ).toBe(0);
  });

  it("stacks weights for a risky new seller", () => {
    // dispute 30% → 40, age 3d → 20, NONE kyc → 20, completion 0.4 → 20 = 100
    expect(
      computeRiskScore({
        closedOrders: 10,
        disputedOrders: 3,
        accountAgeDays: 3,
        kycStatus: "NONE",
        completionRate: 0.4,
      }),
    ).toBe(100);
  });
});

describe("resolveSellerLevel", () => {
  it("starts everyone at BRONZE", () => {
    expect(resolveSellerLevel(0, 0, "NONE", 0)).toBe("BRONZE");
  });

  it("blocks KYC-gated levels until APPROVED", () => {
    // High score + sales but no KYC → must land on a level that doesn't require KYC.
    const withoutKyc = resolveSellerLevel(80, 100, "PENDING", 0);
    expect(SELLER_LEVELS.find((l) => l.id === withoutKyc)!.requiresKyc).toBe(false);
    // Same seller WITH approved KYC unlocks a higher, KYC-gated level.
    const withKyc = resolveSellerLevel(80, 100, "APPROVED", 0);
    expect(SELLER_LEVELS.find((l) => l.id === withKyc)!.requiresKyc).toBe(true);
  });

  it("never returns a level the seller doesn't meet thresholds for", () => {
    const level = resolveSellerLevel(50, 5, "NONE", 0);
    const cfg = SELLER_LEVELS.find((l) => l.id === level)!;
    expect(50).toBeGreaterThanOrEqual(cfg.minTrustScore);
    expect(5).toBeGreaterThanOrEqual(cfg.minTotalSales);
  });
});
