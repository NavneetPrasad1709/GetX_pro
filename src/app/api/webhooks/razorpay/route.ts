import { createHash } from "crypto";
import * as Sentry from "@sentry/nextjs";
import { applyPaymentEvent } from "@/server/services/payments";
import {
  normalizeRazorpayEvent,
  verifyRazorpayWebhook,
} from "@/server/services/payments/razorpay";
import { clientIpFromHeaders, isWebhookIpAllowed } from "@/config/webhooks";

/**
 * Razorpay webhook (guardrails §2). Order of operations is the whole game:
 *   1. read the RAW body (any parse-then-restringify breaks the HMAC);
 *   2. verify X-Razorpay-Signature = HMAC-SHA256(raw, WEBHOOK secret) in
 *      constant time — invalid → 401, body never interpreted;
 *   3. dedupe on the unique `x-razorpay-event-id` header (at-least-once
 *      delivery; `payment.captured` AND `order.paid` both fire per payment)
 *      + transaction + state machine, all inside applyPaymentEvent.
 *
 * Razorpay expects a fast 2xx (~5s timeout, exponential retries for 24h, then
 * the webhook is auto-disabled) — so 500 ONLY for transient faults.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
  try {
    // IP allowlist (Step 32) — drop forged traffic before any work. Open by
    // default until RAZORPAY_WEBHOOK_IPS is set (see src/config/webhooks.ts).
    const ip = clientIpFromHeaders(req.headers);
    if (!isWebhookIpAllowed("RAZORPAY", ip)) {
      console.warn(`[webhook:razorpay] rejected non-allowlisted IP ${ip}`);
      return new Response("Forbidden", { status: 403 });
    }

    const rawBody = await req.text();

    if (!verifyRazorpayWebhook(rawBody, req.headers.get("x-razorpay-signature"))) {
      console.warn("[webhook:razorpay] invalid signature rejected");
      return new Response("Unauthorized", { status: 401 });
    }

    // Unique per delivery, per official docs. The raw-body fallback only
    // covers a pathological missing header — same body dedupes the same.
    const eventId =
      req.headers.get("x-razorpay-event-id") ??
      `rzp:sha256:${createHash("sha256").update(rawBody).digest("hex")}`;

    let body: unknown;
    try {
      body = JSON.parse(rawBody);
    } catch {
      return new Response("Bad request", { status: 400 });
    }

    const event = normalizeRazorpayEvent(eventId, body as Parameters<typeof normalizeRazorpayEvent>[1]);
    if (!event) {
      // An event type we don't subscribe to / don't act on — acknowledge.
      return new Response("OK", { status: 200 });
    }

    const result = await applyPaymentEvent(event);

    if (result.outcome === "amount_mismatch") {
      Sentry.captureMessage(
        `Razorpay amount mismatch quarantined for order ${result.orderId}`,
        "error",
      );
      await Sentry.flush(2000);
    } else if (
      result.outcome === "ignored" &&
      result.reason === "payment_for_dead_order"
    ) {
      Sentry.captureMessage(
        `Razorpay payment arrived for dead order ${result.orderId} — manual refund needed`,
        "error",
      );
      await Sentry.flush(2000);
    }

    console.log(`[webhook:razorpay] ${eventId} → ${result.outcome}`);
    return new Response("OK", { status: 200 });
  } catch (err) {
    // Transient fault — 500 so Razorpay retries (it backs off for 24h).
    Sentry.captureException(err);
    await Sentry.flush(2000);
    console.error("[webhook:razorpay] processing failed", err);
    return new Response("Internal error", { status: 500 });
  }
}
