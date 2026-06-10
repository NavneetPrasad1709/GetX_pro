"use server";

import * as Sentry from "@sentry/nextjs";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { rateLimitDistributed } from "@/lib/rate-limit";
import { captureServerEvent } from "@/lib/posthog";
import {
  createChargeForOrder,
  PaymentGatewayError,
  type CreateChargeResult,
} from "@/server/services/payments";

/**
 * Payment server actions (Step 09). Standard mutation shape:
 *   1. auth()  2. per-user rate limit  3. Zod  4. service.
 * The client sends ONLY an order id + provider choice — every money figure
 * comes from the DB inside the service (guardrails §5).
 */

const startPaymentSchema = z.object({
  orderId: z
    .string()
    .trim()
    .min(1)
    .max(64)
    .regex(/^[a-z0-9]+$/i, "Invalid order"),
  provider: z.enum(["COINGATE", "RAZORPAY"]),
});

export type StartPaymentResult =
  | { ok: true; charge: CreateChargeResult }
  | { ok: false; error: string };

export async function startPaymentAction(
  raw: unknown,
): Promise<StartPaymentResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false, error: "Please log in to pay for this order." };
  }
  const user = { id: session.user.id, role: session.user.role };

  // Gateway calls are expensive — keep the per-user lid tight (userId only,
  // never the attacker-controlled IP).
  const rl = await rateLimitDistributed(`pay-start:${user.id}`, {
    limit: 10,
    windowMs: 60_000,
  });
  if (!rl.ok) {
    return { ok: false, error: `Too many attempts. Try again in ${rl.retryAfterSec}s.` };
  }

  const parsed = startPaymentSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: "Invalid payment request." };
  }

  try {
    const charge = await createChargeForOrder(
      user,
      parsed.data.orderId,
      parsed.data.provider,
    );
    // Analytics (Step 31): payment funnel event — IDs + provider only, no PII.
    captureServerEvent("payment_initiated", user.id, {
      orderId: parsed.data.orderId,
      provider: parsed.data.provider.toLowerCase(),
    });
    return { ok: true, charge };
  } catch (err) {
    if (err instanceof PaymentGatewayError) {
      return { ok: false, error: err.message };
    }
    // Caught (not re-thrown) → onRequestError never sees it; capture manually.
    Sentry.captureException(err);
    await Sentry.flush(2000);
    console.error("[startPaymentAction]", err);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}
