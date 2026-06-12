import { z } from "zod";
import { parsePriceToMinor } from "@/lib/money";

/**
 * Payout input schemas (Step 14). The amount is a major-unit STRING ("500")
 * converted to integer minor units via string math (lib/money) — floats never
 * touch money. Balance + limits are re-checked server-side in the service.
 */

const id = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9]+$/i, "Invalid id");

export const requestPayoutSchema = z.object({
  amount: z
    .string()
    .trim()
    .min(1, "Enter an amount")
    .transform((raw, ctx) => {
      const minor = parsePriceToMinor(raw, "USD");
      if (minor === null) {
        ctx.addIssue({ code: "custom", message: "Enter a valid amount (e.g. 500)" });
        return z.NEVER;
      }
      return minor;
    }),
  // Method is determined by the seller's SAVED payout destination (P1-T1), not a
  // picker — kept optional for backward-compat with older clients.
  method: z.enum(["RAZORPAY", "CRYPTO"]).optional(),
  // Instant payout fast-track (Prompt 15b) — server recomputes the fee.
  instant: z.coerce.boolean().optional(),
});

export const markPaidSchema = z.object({
  payoutId: id,
  providerRef: z.string().trim().max(128).optional(),
});

export const markFailedSchema = z.object({
  payoutId: id,
  reason: z.string().trim().min(1, "Add a reason").max(500),
});

export type RequestPayoutInput = z.input<typeof requestPayoutSchema>;
