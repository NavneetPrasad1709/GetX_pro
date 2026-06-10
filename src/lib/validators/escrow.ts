import { z } from "zod";

/**
 * Escrow/delivery input schemas (Step 10). ONE schema per action, used by the
 * client island AND re-validated inside the server action. The client only ever
 * sends an order id (+ delivery text / dispute reason) — never any money figure;
 * the service recomputes all amounts from the DB (guardrails §1, §8).
 */

const orderId = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9]+$/i, "Invalid order");

export const MAX_DELIVERY_CHARS = 5000;
export const MAX_DISPUTE_CHARS = 1000;

export const deliverSchema = z.object({
  orderId,
  content: z
    .string()
    .trim()
    .min(1, "Add the delivery details (login, code or instructions).")
    .max(MAX_DELIVERY_CHARS, `Delivery details are too long (max ${MAX_DELIVERY_CHARS} characters).`),
});

export const confirmReceiptSchema = z.object({ orderId });

export const openDisputeSchema = z.object({
  orderId,
  reason: z
    .string()
    .trim()
    .min(10, "Tell us what went wrong (at least 10 characters).")
    .max(MAX_DISPUTE_CHARS, `Please keep it under ${MAX_DISPUTE_CHARS} characters.`),
});

export type DeliverInput = z.input<typeof deliverSchema>;
export type DeliverParsed = z.output<typeof deliverSchema>;
export type OpenDisputeInput = z.input<typeof openDisputeSchema>;
