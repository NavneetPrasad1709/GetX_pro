import { randomBytes, timingSafeEqual } from "crypto";
import { db } from "@/lib/db";
import { minorToMajorString, parsePriceToMinor } from "@/lib/money";
import { siteConfig } from "@/config/site";
import {
  PaymentGatewayError,
  type ChargeOrder,
  type CreateChargeResult,
  type NormalizedPaymentEvent,
} from "./types";

/**
 * CoinGate (crypto) gateway — verified against developer.coingate.com
 * (create-order.md, payment-callback.md, api-callbacks.md, order-statuses.md):
 *
 *   • Create order: POST {base}/api/v2/orders, header `Authorization: Token X`.
 *     Sandbox + live are SEPARATE environments with separate tokens.
 *   • Amounts at the CoinGate boundary are DECIMAL strings — converted from/to
 *     our integer minor units at the edge only (ledger never sees decimals).
 *   • Callbacks are NOT HMAC-signed. Authenticity = the per-order random
 *     `token` we generate (echoed back, compared in constant time) AND a
 *     re-fetch of GET /api/v2/orders/{id} whose response is the ONLY status
 *     truth — the callback body itself is treated as a trigger, nothing more.
 *   • Statuses: new | pending | confirming | paid | invalid | expired |
 *     canceled | refunded | partially_refunded. There is NO "underpaid"
 *     status — underpayment surfaces via the `underpaid_amount` field on
 *     invalid/expired orders.
 */

export type CoinGateStatus =
  | "new"
  | "pending"
  | "confirming"
  | "paid"
  | "invalid"
  | "expired"
  | "canceled"
  | "refunded"
  | "partially_refunded";

/** Authoritative order shape (the GET re-fetch response fields we use). */
export type CoinGateOrder = {
  id: number;
  status: CoinGateStatus;
  price_amount: string;
  price_currency: string;
  underpaid_amount?: string | null;
  order_id?: string | null;
  payment_url?: string | null;
  token?: string | null;
};

function host(): string {
  return process.env.COINGATE_ENVIRONMENT === "live"
    ? "https://api.coingate.com"
    : "https://api-sandbox.coingate.com";
}

/** Payment Gateway endpoints live under /api/v2 (verified live against sandbox). */
function apiBase(): string {
  return `${host()}/api/v2`;
}

function apiKey(): string {
  const key = process.env.COINGATE_API_KEY;
  if (!key) {
    throw new PaymentGatewayError(
      "Crypto payments are not configured yet. Please try UPI/cards instead.",
    );
  }
  return key;
}

/** Reuse window for an existing pending invoice (CoinGate 'new' lives ~2h). */
const REUSE_WINDOW_MS = 60 * 60 * 1000;

/**
 * Price currencies CoinGate accepts directly. INR is NOT one of them
 * (verified live: 422 "Price currency INR is not supported") — INR orders are
 * converted to USD at CoinGate's OWN merchant rate before invoicing.
 */
const DIRECT_PRICE_CURRENCIES = new Set(["USD", "EUR", "GBP", "USDT", "BTC", "ETH"]);

/**
 * CoinGate merchant FX rate (public endpoint, verified live: supports INR).
 * Using THEIR rate keeps our USD invoice consistent with their books.
 */
async function fetchCoinGateRate(from: string, to: string): Promise<number> {
  const res = await fetch(`${host()}/v2/rates/merchant/${from}/${to}`, {
    signal: AbortSignal.timeout(10_000),
  });
  const text = res.ok ? (await res.text()).trim() : "";
  const rate = Number(text);
  if (!res.ok || !Number.isFinite(rate) || rate <= 0) {
    throw new PaymentGatewayError(
      "Crypto pricing is temporarily unavailable. Please try again shortly.",
    );
  }
  return rate;
}

/**
 * The charge CoinGate will actually invoice. Same-currency totals pass
 * through; INR converts to USD minor units, rounded UP — the buyer can be a
 * fraction of a cent over our INR total, never under. (The single float
 * multiply here is a documented guardrails-§1 boundary exception: the FX rate
 * arrives as a decimal; ceil bounds the error and fixes its direction.)
 */
async function toCoinGateCharge(
  order: ChargeOrder,
): Promise<{ amountMinor: number; currency: string }> {
  const currency = order.currency.toUpperCase();
  if (DIRECT_PRICE_CURRENCIES.has(currency)) {
    return { amountMinor: order.totalMinor, currency };
  }
  const rate = await fetchCoinGateRate(currency, "USD");
  // paise → US cents: both are 1/100 units, so the scale cancels out.
  const amountMinor = Math.max(1, Math.ceil(order.totalMinor * rate));
  return { amountMinor, currency: "USD" };
}

/** The order-economics snapshot kept on Payment.raw (re-price drift guard). */
type ChargeSnapshot = {
  forOrderTotalMinor?: unknown;
  forOrderCurrency?: unknown;
  payment_url?: unknown;
};

/**
 * Create (or reuse) a CoinGate invoice for the order and return the hosted
 * payment URL. A fresh high-entropy `token` is generated per invoice and
 * stored on the Payment row — the callback must echo it back to be trusted.
 */
export async function createCoinGateCharge(
  order: ChargeOrder,
): Promise<CreateChargeResult> {
  // Reuse an existing live invoice if the ORDER total hasn't changed — a
  // double-click or back-button must not mint a second invoice. (The charge
  // itself may be USD; the snapshot ties it to the INR economics.)
  const existing = await db.payment.findFirst({
    where: {
      orderId: order.id,
      provider: "COINGATE",
      status: "PENDING",
      createdAt: { gte: new Date(Date.now() - REUSE_WINDOW_MS) },
    },
    orderBy: { createdAt: "desc" },
    select: { id: true, raw: true },
  });
  if (existing?.raw && typeof existing.raw === "object" && !Array.isArray(existing.raw)) {
    const snap = existing.raw as ChargeSnapshot;
    if (
      snap.forOrderTotalMinor === order.totalMinor &&
      snap.forOrderCurrency === order.currency &&
      typeof snap.payment_url === "string" &&
      snap.payment_url
    ) {
      return { provider: "COINGATE", paymentId: existing.id, redirectUrl: snap.payment_url };
    }
  }

  const charge = await toCoinGateCharge(order);
  const token = randomBytes(32).toString("hex");
  const res = await fetch(`${apiBase()}/orders`, {
    method: "POST",
    headers: {
      Authorization: `Token ${apiKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      order_id: order.id,
      price_amount: minorToMajorString(charge.amountMinor, charge.currency),
      price_currency: charge.currency,
      title: order.listingTitle.slice(0, 150).padEnd(3, "."),
      description: `GETX order ${order.id}`,
      callback_url: `${siteConfig.url}/api/webhooks/coingate`,
      success_url: `${siteConfig.url}/orders/${order.id}?confirming=1`,
      cancel_url: `${siteConfig.url}/orders/${order.id}?cancelled=1`,
      token,
    }),
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) {
    // 422 = validation problem on our side; anything else = provider trouble.
    const body = await res.text().catch(() => "");
    console.error(`[coingate] create order failed: ${res.status} ${body.slice(0, 500)}`);
    throw new PaymentGatewayError(
      "Could not start the crypto payment. Please try again in a moment.",
    );
  }

  const cg = (await res.json()) as CoinGateOrder;
  if (!cg.id || !cg.payment_url) {
    console.error("[coingate] create order: unexpected response shape");
    throw new PaymentGatewayError(
      "Could not start the crypto payment. Please try again in a moment.",
    );
  }

  const payment = await db.payment.create({
    data: {
      orderId: order.id,
      provider: "COINGATE",
      providerRef: String(cg.id),
      webhookToken: token,
      // The CHARGE as invoiced (USD for INR orders) — the webhook must
      // confirm exactly this. The order's own economics live in the snapshot.
      amountMinor: charge.amountMinor,
      currency: charge.currency,
      status: "PENDING",
      // payment_url kept for invoice reuse; no buyer PII stored.
      raw: {
        payment_url: cg.payment_url,
        coingateStatus: cg.status,
        forOrderTotalMinor: order.totalMinor,
        forOrderCurrency: order.currency,
      },
    },
  });

  return { provider: "COINGATE", paymentId: payment.id, redirectUrl: cg.payment_url };
}

/**
 * Authoritative status fetch — GET /api/v2/orders/{id}. The webhook handler
 * NEVER trusts the callback body; this response decides what happened.
 */
export async function fetchCoinGateOrder(coingateId: string): Promise<CoinGateOrder> {
  const res = await fetch(`${apiBase()}/orders/${encodeURIComponent(coingateId)}`, {
    headers: { Authorization: `Token ${apiKey()}` },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    throw new PaymentGatewayError(`CoinGate order fetch failed: HTTP ${res.status}`);
  }
  return (await res.json()) as CoinGateOrder;
}

/** Callback body (form-encoded or JSON, configurable per CoinGate API app). */
export type CoinGateCallback = { id: string; token: string };

/**
 * Parse a callback request body into the two fields we act on: the CoinGate
 * order id (lookup key) and the echoed token (authenticity). Returns null on
 * garbage input — the route answers 400.
 */
export function parseCoinGateCallback(
  rawBody: string,
  contentType: string | null,
): CoinGateCallback | null {
  try {
    let id: unknown;
    let token: unknown;
    if (contentType?.includes("application/json")) {
      const json: unknown = JSON.parse(rawBody);
      if (!json || typeof json !== "object") return null;
      ({ id, token } = json as { id?: unknown; token?: unknown });
    } else {
      const form = new URLSearchParams(rawBody);
      id = form.get("id") ?? undefined;
      token = form.get("token") ?? undefined;
    }
    if (id === undefined || id === null || `${String(id)}`.length === 0) return null;
    if (typeof token !== "string" || token.length === 0) return null;
    return { id: String(id), token };
  } catch {
    return null;
  }
}

/** Constant-time token comparison — never a `===` on secrets. */
export function coinGateTokenMatches(stored: string | null, received: string): boolean {
  if (!stored) return false;
  const a = Buffer.from(stored);
  const b = Buffer.from(received);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Map an AUTHORITATIVE CoinGate order (from the re-fetch) onto our normalized
 * event. Returns null for statuses Step 09 deliberately does not act on
 * (refunds arrive with the dispute flow in Step 10) — the route logs those.
 */
export function normalizeCoinGateOrder(cg: CoinGateOrder): NormalizedPaymentEvent | null {
  const underpaidMinor = cg.underpaid_amount
    ? (parsePriceToMinor(cg.underpaid_amount, cg.price_currency) ?? 0)
    : 0;

  let kind: NormalizedPaymentEvent["kind"];
  switch (cg.status) {
    case "paid":
      // CoinGate's "Underpaid Cover" merchant feature can mark a SHORT-paid
      // invoice as `paid` (with underpaid_amount set). Never auto-escrow the
      // full order total off a shortfall — route to UNDERPAID for support.
      kind = underpaidMinor > 0 ? "UNDERPAID" : "CONFIRMED";
      break;
    case "invalid":
    case "expired":
      // No "underpaid" status exists — a partial payment lands in invalid or
      // expired WITH underpaid_amount set. That's our UNDERPAID order state.
      kind = underpaidMinor > 0 ? "UNDERPAID" : cg.status === "expired" ? "EXPIRED" : "FAILED";
      break;
    case "canceled":
      kind = "FAILED";
      break;
    case "new":
    case "pending":
    case "confirming":
      kind = "PENDING";
      break;
    case "refunded":
    case "partially_refunded":
      return null; // Step 10 (disputes/refunds) — log + admin follow-up
    default:
      return null;
  }

  return {
    provider: "COINGATE",
    // No event id in callbacks → synthesize one per (order, status): replays
    // of the same status dedupe; real progressions still process.
    providerEventId: `cg:${cg.id}:${cg.status}`,
    providerRef: String(cg.id),
    kind,
    amountMinor:
      kind === "CONFIRMED"
        ? parsePriceToMinor(cg.price_amount, cg.price_currency)
        : null,
    currency: kind === "CONFIRMED" ? cg.price_currency : null,
    // Audit snapshot — selected fields only, never the whole payload.
    raw: {
      coingateStatus: cg.status,
      price_amount: cg.price_amount,
      price_currency: cg.price_currency,
      underpaid_amount: cg.underpaid_amount ?? null,
    },
  };
}
