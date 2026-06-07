import { z } from "zod";

/**
 * Order input schemas (Step 08). ONE schema, used by the checkout client form
 * AND re-validated inside the server action. The client only ever sends the
 * listing slug + quantity (+ optional provider) — NEVER a price or total. The
 * server recomputes all money from the DB listing (guardrail §1, §5).
 */

/** Per-order quantity ceiling (mirrors the buy box). Stock is checked in the service. */
export const MAX_ORDER_QTY = 99;

export const createOrderSchema = z.object({
  // Listing slug from the URL/UI — shape-validated; existence + ACTIVE status
  // are enforced server-side against the DB.
  listingSlug: z
    .string()
    .trim()
    .min(1)
    .max(120)
    .regex(/^[a-z0-9-]+$/, "Invalid listing"),
  qty: z.coerce
    .number()
    .int("Quantity must be a whole number")
    .min(1, "Quantity must be at least 1")
    .max(MAX_ORDER_QTY, `Quantity cannot exceed ${MAX_ORDER_QTY}`),
  // Buyer's chosen gateway (the real charge happens in Step 09). Optional now.
  provider: z.enum(["COINGATE", "RAZORPAY"]).optional(),
});

export type CreateOrderInput = z.input<typeof createOrderSchema>;
export type CreateOrderParsed = z.output<typeof createOrderSchema>;
