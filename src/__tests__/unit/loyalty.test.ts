import { describe, it, expect } from "vitest";
import {
  LOYALTY_CONFIG,
  pointsToMinorUnits,
  minorUnitsToPoints,
  buyerEarnPoints,
  sellerEarnPoints,
  subtotalRedemptionCapPoints,
} from "@/config/loyalty";

/** Loyalty points are an append-only ledger; the math is pure + floored. */
describe("loyalty point math", () => {
  it("points → minor units (floor, never negative)", () => {
    expect(pointsToMinorUnits(100)).toBe(100 * LOYALTY_CONFIG.POINT_VALUE_MINOR);
    expect(pointsToMinorUnits(10.9)).toBe(10 * LOYALTY_CONFIG.POINT_VALUE_MINOR);
    expect(pointsToMinorUnits(-5)).toBe(0);
  });

  it("minor units → points (floor, never negative)", () => {
    expect(minorUnitsToPoints(1000)).toBe(Math.floor(1000 / LOYALTY_CONFIG.POINT_VALUE_MINOR));
    expect(minorUnitsToPoints(5)).toBe(0);
    expect(minorUnitsToPoints(-100)).toBe(0);
  });

  it("round-trips points → minor → points", () => {
    expect(minorUnitsToPoints(pointsToMinorUnits(250))).toBe(250);
  });

  it("buyer earns 1 pt per ₹10 of subtotal", () => {
    // ₹100 = 10_000 paise → 10 points
    expect(buyerEarnPoints(10_000)).toBe(10);
    expect(buyerEarnPoints(999)).toBe(0); // < ₹10
    expect(buyerEarnPoints(-1)).toBe(0);
  });

  it("seller earns 1 pt per ₹20 of net", () => {
    // ₹200 net = 20_000 paise → 10 points
    expect(sellerEarnPoints(20_000)).toBe(10);
    expect(sellerEarnPoints(1999)).toBe(0); // < ₹20
  });

  it("redemption cap is 20% of subtotal in points", () => {
    // ₹100 subtotal = 10_000 paise → 20% = 2_000 paise → /10 = 200 points
    expect(subtotalRedemptionCapPoints(10_000)).toBe(200);
    expect(subtotalRedemptionCapPoints(0)).toBe(0);
  });
});
