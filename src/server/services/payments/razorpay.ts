import { createHmac, timingSafeEqual } from "crypto";
import { db } from "@/lib/db";
import { usdMinorToInrMinor } from "@/lib/money";
import {
  PaymentGatewayError,
  type ChargeOrder,
  type CreateChargeResult,
  type NormalizedPaymentEvent,
} from "./types";

/**
 * Razorpay (UPI/INR) gateway — verified against razorpay.com/docs
 * (orders/create, web standard checkout, webhooks/validate-test, best-practices):
 *
 *   • Create order: POST https://api.razorpay.com/v1/orders, HTTP Basic auth
 *     (key_id:key_secret). `amount` is integer PAISE — exactly our minor units.
 *   • The buyer pays via Standard Checkout (checkout.js) on the client with
 *     the returned rzp order id; the checkout `handler` result is UX-only.
 *   • Webhook = source of truth. Signature: X-Razorpay-Signature =
 *     HMAC-SHA256(RAW request body, WEBHOOK secret — NOT the API key secret),
 *     compared in constant time. Dedupe key: the unique `x-razorpay-event-id`
 *     header (at-least-once delivery; `payment.captured` AND `order.paid`
 *     BOTH fire for one successful payment — applyPaymentEvent's CAS makes
 *     the second a no-op).
 */

const RZP_API = "https://api.razorpay.com/v1";

function credentials(): { keyId: string; keySecret: string } {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) {
    throw new PaymentGatewayError(
      "UPI/card payments are not configured yet. Please try crypto instead.",
    );
  }
  return { keyId, keySecret };
}

type RzpOrderResponse = {
  id: string;
  amount: number;
  currency: string;
  status: string;
};

/**
 * Create (or reuse) a Razorpay order and return what the client needs to open
 * Standard Checkout. Razorpay orders don't expire quickly, so an existing
 * pending one with the same amount is always reused (no duplicate charges
 * from double-clicks).
 */
export async function createRazorpayCharge(
  order: ChargeOrder,
): Promise<CreateChargeResult> {
  const { keyId, keySecret } = credentials();

  // Razorpay settles INR only — convert the order's USD total to INR paise at
  // the current FX rate (O-T1). The order/ledger/escrow stay in USD; ONLY the
  // gateway charge is INR. The amount-mismatch check then reconciles the INR
  // webhook against this INR Payment row, while the raw snapshot pins the USD
  // order economics (re-price drift guard) — exactly like the CoinGate path.
  const rzpAmountMinor = usdMinorToInrMinor(order.totalMinor);

  const checkoutShell = {
    keyId,
    amountMinor: rzpAmountMinor,
    currency: "INR",
    name: "GETX",
    description: order.listingTitle.slice(0, 120),
    prefillEmail: order.buyerEmail,
  };

  const existing = await db.payment.findFirst({
    where: {
      orderId: order.id,
      provider: "RAZORPAY",
      status: "PENDING",
      amountMinor: rzpAmountMinor,
      providerRef: { not: null },
    },
    orderBy: { createdAt: "desc" },
    select: { id: true, providerRef: true },
  });
  if (existing?.providerRef) {
    return {
      provider: "RAZORPAY",
      paymentId: existing.id,
      checkout: { ...checkoutShell, rzpOrderId: existing.providerRef },
    };
  }

  const res = await fetch(`${RZP_API}/orders`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      amount: rzpAmountMinor, // integer INR paise (Razorpay settles INR; O-T1 FX)
      currency: "INR",
      receipt: order.id, // cuid ≤ 40 chars, unique per order
      notes: { getxOrderId: order.id, usdTotalMinor: order.totalMinor },
    }),
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error(`[razorpay] create order failed: ${res.status} ${body.slice(0, 500)}`);
    throw new PaymentGatewayError(
      "Could not start the UPI/card payment. Please try again in a moment.",
    );
  }

  const rzp = (await res.json()) as RzpOrderResponse;
  if (!rzp.id) {
    console.error("[razorpay] create order: unexpected response shape");
    throw new PaymentGatewayError(
      "Could not start the UPI/card payment. Please try again in a moment.",
    );
  }

  const payment = await db.payment.create({
    data: {
      orderId: order.id,
      provider: "RAZORPAY",
      providerRef: rzp.id,
      // The CHARGE as invoiced (INR); the webhook must confirm exactly this.
      amountMinor: rzpAmountMinor,
      currency: "INR",
      status: "PENDING",
      raw: {
        rzpStatus: rzp.status,
        // Order-economics snapshot (same shape as CoinGate's) — the webhook
        // quarantines a confirm whose order was re-priced after this charge.
        forOrderTotalMinor: order.totalMinor,
        forOrderCurrency: order.currency,
      },
    },
  });

  return {
    provider: "RAZORPAY",
    paymentId: payment.id,
    checkout: { ...checkoutShell, rzpOrderId: rzp.id },
  };
}

/**
 * Verify X-Razorpay-Signature over the RAW body (never a re-stringified parse —
 * byte differences break the HMAC) with the dashboard WEBHOOK secret.
 */
export function verifyRazorpayWebhook(
  rawBody: string,
  signature: string | null,
): boolean {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret || !signature) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** The slice of Razorpay's webhook payload we act on. */
type RzpWebhookBody = {
  event?: string;
  payload?: {
    payment?: {
      entity?: {
        id?: string;
        order_id?: string;
        amount?: number;
        currency?: string;
        status?: string;
        method?: string;
        error_code?: string | null;
        error_description?: string | null;
      };
    };
    order?: {
      entity?: {
        id?: string;
        amount?: number;
        amount_paid?: number;
        currency?: string;
        status?: string;
      };
    };
  };
};

/**
 * Map a VERIFIED Razorpay webhook onto our normalized event. Subscribed
 * events: payment.captured, order.paid (both = money in; CAS dedupes the
 * pair), payment.failed (attempt failed — order stays payable; Razorpay can
 * still send a later capture for the same rzp order, which we honor).
 * Anything else returns null (acknowledged, ignored).
 */
export function normalizeRazorpayEvent(
  eventId: string,
  body: RzpWebhookBody,
): NormalizedPaymentEvent | null {
  const event = body.event ?? "";
  const payment = body.payload?.payment?.entity;
  const order = body.payload?.order?.entity;

  if (event === "payment.captured" && payment?.order_id) {
    return {
      provider: "RAZORPAY",
      providerEventId: eventId,
      providerRef: payment.order_id,
      kind: "CONFIRMED",
      amountMinor: typeof payment.amount === "number" ? payment.amount : null,
      currency: payment.currency ?? null,
      raw: {
        event,
        rzpPaymentId: payment.id ?? null,
        amount: payment.amount ?? null,
        currency: payment.currency ?? null,
        method: payment.method ?? null,
        status: payment.status ?? null,
      },
    };
  }

  if (event === "order.paid" && order?.id) {
    return {
      provider: "RAZORPAY",
      providerEventId: eventId,
      providerRef: order.id,
      kind: "CONFIRMED",
      amountMinor:
        typeof order.amount_paid === "number"
          ? order.amount_paid
          : typeof order.amount === "number"
            ? order.amount
            : null,
      currency: order.currency ?? null,
      raw: {
        event,
        amount_paid: order.amount_paid ?? null,
        currency: order.currency ?? null,
        status: order.status ?? null,
      },
    };
  }

  if (event === "payment.failed" && payment?.order_id) {
    return {
      provider: "RAZORPAY",
      providerEventId: eventId,
      providerRef: payment.order_id,
      kind: "FAILED",
      amountMinor: null,
      currency: null,
      raw: {
        event,
        rzpPaymentId: payment.id ?? null,
        error_code: payment.error_code ?? null,
        error_description: payment.error_description ?? null,
      },
    };
  }

  return null;
}
