import * as Sentry from "@sentry/nextjs";
import { applyPaymentEvent } from "@/server/services/payments";
import {
  coinGateTokenMatches,
  fetchCoinGateOrder,
  normalizeCoinGateOrder,
  parseCoinGateCallback,
} from "@/server/services/payments/coingate";
import { db } from "@/lib/db";
import { clientIpFromHeaders, isWebhookIpAllowed } from "@/config/webhooks";

/**
 * CoinGate payment callback (guardrails §2). CoinGate does NOT sign callbacks,
 * so the chain of trust is:
 *   1. the echoed per-order `token` must match what we generated (constant
 *      time) — otherwise 401 and nothing is read further;
 *   2. the callback body is then thrown away: we RE-FETCH the order from the
 *      CoinGate API and only that authoritative response drives our state.
 * Dedupe + transaction + state machine live in applyPaymentEvent.
 *
 * Responses: 2xx acknowledges (CoinGate stops retrying); non-2xx triggers its
 * retry schedule (up to ~40 attempts) — so 500 ONLY for transient faults where
 * a retry can actually succeed.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
  try {
    // IP allowlist (Step 32) — drop forged traffic early. Open by default until
    // COINGATE_WEBHOOK_IPS is set (see src/config/webhooks.ts).
    const ip = clientIpFromHeaders(req.headers);
    if (!isWebhookIpAllowed("COINGATE", ip)) {
      console.warn(`[webhook:coingate] rejected non-allowlisted IP ${ip}`);
      return new Response("Forbidden", { status: 403 });
    }

    const rawBody = await req.text();
    const callback = parseCoinGateCallback(rawBody, req.headers.get("content-type"));
    if (!callback) {
      return new Response("Bad request", { status: 400 });
    }

    // 1) Authenticity: echoed token vs the one stored at charge creation.
    const payment = await db.payment.findUnique({
      where: {
        provider_providerRef: { provider: "COINGATE", providerRef: callback.id },
      },
      select: { webhookToken: true },
    });
    if (!payment || !coinGateTokenMatches(payment.webhookToken, callback.token)) {
      // Unknown invoice or wrong token — possibly a probe. Log, never process.
      console.warn(`[webhook:coingate] rejected callback for ref ${callback.id}`);
      return new Response("Unauthorized", { status: 401 });
    }

    // 2) Truth: re-fetch from the CoinGate API; ignore the callback body.
    const cgOrder = await fetchCoinGateOrder(callback.id);
    const event = normalizeCoinGateOrder(cgOrder);
    if (!event) {
      // refunded / partially_refunded → Step 10 territory; surface to admins.
      Sentry.captureMessage(
        `CoinGate status "${cgOrder.status}" needs manual handling (ref ${callback.id})`,
        "warning",
      );
      await Sentry.flush(2000);
      return new Response("OK", { status: 200 });
    }

    const result = await applyPaymentEvent(event);

    if (cgOrder.status === "paid" && event.kind === "UNDERPAID") {
      // CoinGate "Underpaid Cover" accepted a short payment as paid — we did
      // NOT escrow; support must reconcile (top-up vs partial refund).
      Sentry.captureMessage(
        `CoinGate marked ref ${callback.id} paid WITH a shortfall — order held UNDERPAID for review`,
        "warning",
      );
      await Sentry.flush(2000);
    }

    if (result.outcome === "amount_mismatch") {
      Sentry.captureMessage(
        `CoinGate amount mismatch quarantined for order ${result.orderId}`,
        "error",
      );
      await Sentry.flush(2000);
    } else if (
      result.outcome === "ignored" &&
      result.reason === "payment_for_dead_order"
    ) {
      Sentry.captureMessage(
        `CoinGate payment arrived for dead order ${result.orderId} — manual refund needed`,
        "error",
      );
      await Sentry.flush(2000);
    }

    console.log(
      `[webhook:coingate] ${cgOrder.status} ref=${callback.id} → ${result.outcome}`,
    );
    return new Response("OK", { status: 200 });
  } catch (err) {
    // Transient fault (DB/API hiccup) — 500 so CoinGate retries later.
    Sentry.captureException(err);
    await Sentry.flush(2000);
    console.error("[webhook:coingate] processing failed", err);
    return new Response("Internal error", { status: 500 });
  }
}
