import { describe, it, expect } from "vitest";
import { ORDER_TRANSITIONS, canTransition } from "@/server/services/orders";
import type { OrderStatus } from "@prisma/client";

/** The order lifecycle is an explicit state machine — only declared edges are legal. */
describe("order state machine", () => {
  it("allows declared transitions", () => {
    expect(canTransition("DRAFT", "AWAITING_PAYMENT")).toBe(true);
    expect(canTransition("AWAITING_PAYMENT", "PAID")).toBe(true);
    expect(canTransition("AWAITING_PAYMENT", "UNDERPAID")).toBe(true);
    expect(canTransition("PAID", "DELIVERED")).toBe(true);
    expect(canTransition("DELIVERED", "COMPLETED")).toBe(true);
    expect(canTransition("PAID", "DISPUTED")).toBe(true);
    expect(canTransition("DISPUTED", "REFUNDED")).toBe(true);
  });

  it("rejects illegal jumps", () => {
    expect(canTransition("DRAFT", "PAID")).toBe(false);
    expect(canTransition("AWAITING_PAYMENT", "DELIVERED")).toBe(false);
    expect(canTransition("PAID", "COMPLETED")).toBe(false); // must deliver first
    expect(canTransition("COMPLETED", "DELIVERED")).toBe(false);
  });

  it("has no outbound edges from terminal states", () => {
    const terminal: OrderStatus[] = ["COMPLETED", "REFUNDED", "CANCELLED", "EXPIRED"];
    for (const s of terminal) {
      expect(ORDER_TRANSITIONS[s]).toEqual([]);
      // canTransition out of a terminal state is always false
      const anyTarget: OrderStatus = "PAID";
      expect(canTransition(s, anyTarget)).toBe(false);
    }
  });

  it("never lists a state as its own successor (no self-loops)", () => {
    for (const [from, tos] of Object.entries(ORDER_TRANSITIONS)) {
      expect(tos).not.toContain(from as OrderStatus);
    }
  });
});
