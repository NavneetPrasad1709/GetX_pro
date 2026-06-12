import type { OrderStatus, PaymentStatus, Prisma } from "@prisma/client";
import { captureException } from "@sentry/nextjs";
import { db } from "@/lib/db";
import { ORDER_TRANSITIONS } from "@/server/services/orders";
import { fireFraudSignal } from "@/server/services/fraud/dispatch";
import {
  checkWashTrade,
  checkMicroOrderRing,
} from "@/server/services/fraud/signals";
import { notifyOrderEvent } from "@/server/services/notifications";
import {
  autoDeliver,
  DeliveryStockoutError,
  getDeliveryItemCount,
  pauseListingOnStockout,
} from "@/server/services/delivery";
import type { NormalizedPaymentEvent, PaymentEventKind } from "./types";

/**
 * Merge an incoming event payload INTO the Payment's existing raw JSON under
 * `lastEvent`, preserving the top-level keys written at charge creation —
 * most critically the {forOrderTotalMinor, forOrderCurrency} drift snapshot,
 * which must stay immutable for the life of the row (a webhook overwriting it
 * would blind the re-price guard).
 */
function mergeRaw(
  existing: unknown,
  eventRaw: Prisma.InputJsonValue,
): Prisma.InputJsonValue {
  const base =
    existing && typeof existing === "object" && !Array.isArray(existing)
      ? (existing as Record<string, unknown>)
      : {};
  return { ...base, lastEvent: eventRaw } as Prisma.InputJsonValue;
}

/**
 * THE money-critical function of Step 09. Takes a signature-VERIFIED,
 * normalized webhook event and applies it to our domain in ONE transaction
 * (guardrails §1 §2 §3):
 *
 *   1. Idempotency — insert ProcessedWebhook FIRST; a duplicate event id
 *      aborts the whole transaction via P2002 → no-op (return 200 upstream).
 *   2. Lookup — Payment by (provider, providerRef); unknown refs are ignored
 *      loudly (logged), never 500 (a retry storm can't fix an unknown ref).
 *   3. Amount check — a CONFIRMED event asserting a different amount/currency
 *      than the order is QUARANTINED (audit log, no PAID) — handles stale
 *      charges after a re-priced checkout, tampering, and currency mismatch.
 *   4. State machine — order transitions via an atomic compare-and-set
 *      (updateMany WHERE status IN allowedFrom): concurrent webhooks race,
 *      exactly ONE wins, so exactly ONE escrow hold is ever written.
 *   5. Escrow — CREDIT ESCROW_HOLD of order.totalMinor (subtotal + buyer fee,
 *      per docs/FEES.md) on the seller's wallet, with the wallet row locked
 *      (SELECT … FOR UPDATE) so balanceAfterMinor snapshots stay correct.
 *   6. Stock — decremented HERE (payment confirmed), not at order creation,
 *      so abandoned orders never lock inventory. Oversell (stock raced to 0
 *      by another paid order) is flagged for admins, never blocks the PAID.
 *
 * Out-of-order webhooks (e.g. late `expired` after `paid`) fall out of the
 * state machine naturally: the transition isn't allowed → recorded, ignored.
 */

export type ApplyEventResult =
  | {
      outcome: "applied";
      orderId: string;
      orderStatus: OrderStatus;
      /** payment confirmed but stock raced to 0 — admin follow-up created */
      oversold?: boolean;
      /** INSTANT-delivery listing (drives post-commit auto-delivery) */
      instant?: boolean;
      listingId?: string;
      /** set post-commit: an item was auto-assigned + the order moved to DELIVERED */
      autoDelivered?: boolean;
      /** set post-commit: INSTANT but no item/key — fell back to MANUAL delivery */
      deliveryStockout?: boolean;
    }
  /** same providerEventId seen before — no-op */
  | { outcome: "duplicate" }
  /** verified event we deliberately did not act on (reason is for logs) */
  | { outcome: "ignored"; reason: string; orderId?: string }
  /** CONFIRMED event whose asserted amount ≠ order total — quarantined */
  | { outcome: "amount_mismatch"; orderId: string };

/** Order statuses allowed to move to `to` — derived FROM the state machine. */
function allowedFrom(to: OrderStatus): OrderStatus[] {
  return (Object.keys(ORDER_TRANSITIONS) as OrderStatus[]).filter((from) =>
    ORDER_TRANSITIONS[from].includes(to),
  );
}

const PAYMENT_STATUS_FOR_KIND: Record<PaymentEventKind, PaymentStatus> = {
  CONFIRMED: "CONFIRMED",
  UNDERPAID: "UNDERPAID",
  EXPIRED: "EXPIRED",
  FAILED: "FAILED",
  PENDING: "PENDING",
};

export async function applyPaymentEvent(
  event: NormalizedPaymentEvent,
): Promise<ApplyEventResult> {
  const result = await db.$transaction(
    async (tx): Promise<ApplyEventResult> => {
    // 1) Idempotency guard — MUST be the first write. `skipDuplicates` maps
    // to INSERT … ON CONFLICT DO NOTHING: a replay yields count 0 (no thrown
    // error, no aborted transaction), and a concurrent duplicate blocks on
    // the unique index until the first transaction commits — so exactly one
    // caller ever proceeds past this line per event id.
    const guard = await tx.processedWebhook.createMany({
      data: [{ provider: event.provider, providerEventId: event.providerEventId }],
      skipDuplicates: true,
    });
    if (guard.count === 0) {
      return { outcome: "duplicate" } satisfies ApplyEventResult;
    }

      // 2) Which payment/order is this about?
      const payment = await tx.payment.findUnique({
        where: {
          provider_providerRef: {
            provider: event.provider,
            providerRef: event.providerRef,
          },
        },
        select: {
          id: true,
          orderId: true,
          amountMinor: true,
          currency: true,
          raw: true,
          order: {
            select: {
              id: true,
              status: true,
              qty: true,
              totalMinor: true,
              currency: true,
              sellerId: true,
              listingId: true,
              listing: { select: { deliveryType: true } },
            },
          },
        },
      });

      if (!payment) {
        // Unknown ref: not ours / wrong environment. Log + 200 upstream —
        // retrying can never make an unknown ref known.
        await tx.auditLog.create({
          data: {
            action: "WEBHOOK_UNKNOWN_REF",
            entity: "Payment",
            entityId: event.providerRef,
            meta: { provider: event.provider, eventId: event.providerEventId, kind: event.kind },
          },
        });
        return { outcome: "ignored", reason: "unknown_provider_ref" };
      }

      const order = payment.order;
      const paymentStatus = PAYMENT_STATUS_FOR_KIND[event.kind];

      // Always keep the payment row's audit trail current (status + the event
      // under raw.lastEvent), WITHOUT clobbering the creation-time snapshot.
      const recordPayment = (status: PaymentStatus) =>
        tx.payment.update({
          where: { id: payment.id },
          data: { status, raw: mergeRaw(payment.raw, event.raw) },
        });

      // 3) CONFIRMED must clear TWO money checks or it is quarantined:
      //    (a) charge check — the gateway confirmed exactly the charge we
      //        created (Payment.amountMinor/currency; for INR crypto orders
      //        that charge is in USD, converted at invoice time). FAIL CLOSED:
      //        an event whose amount we couldn't parse is NOT trusted;
      //    (b) drift check — the order's economics still match the snapshot
      //        taken when the charge was created (a re-priced checkout must
      //        not get PAID off a stale, cheaper invoice).
      if (event.kind === "CONFIRMED") {
        const chargeMismatch =
          event.amountMinor === null ||
          event.currency === null ||
          event.amountMinor !== payment.amountMinor ||
          event.currency.toUpperCase() !== payment.currency.toUpperCase();

        const snap =
          payment.raw && typeof payment.raw === "object" && !Array.isArray(payment.raw)
            ? (payment.raw as { forOrderTotalMinor?: unknown; forOrderCurrency?: unknown })
            : null;
        const hasSnapshot = typeof snap?.forOrderTotalMinor === "number";
        const drift = hasSnapshot
          ? snap.forOrderTotalMinor !== order.totalMinor ||
            snap.forOrderCurrency !== order.currency
          : // No snapshot (legacy row): the charge itself must equal the order.
            payment.amountMinor !== order.totalMinor ||
            payment.currency.toUpperCase() !== order.currency.toUpperCase();

        if (chargeMismatch || drift) {
          await tx.payment.update({
            where: { id: payment.id },
            // Evidence under lastEvent; snapshot keys survive the update.
            data: { raw: mergeRaw(payment.raw, event.raw) },
          });
          await tx.auditLog.create({
            data: {
              action: "PAYMENT_AMOUNT_MISMATCH",
              entity: "Order",
              entityId: order.id,
              meta: {
                provider: event.provider,
                eventId: event.providerEventId,
                reason:
                  event.amountMinor === null || event.currency === null
                    ? "unverified_amount" // fail-closed: amount missing/unparseable
                    : chargeMismatch
                      ? "charge_mismatch"
                      : hasSnapshot
                        ? "order_repriced"
                        : "no_snapshot_review",
                chargeMinor: payment.amountMinor,
                chargeCurrency: payment.currency,
                orderTotalMinor: order.totalMinor,
                orderCurrency: order.currency,
                gotMinor: event.amountMinor,
                gotCurrency: event.currency,
              },
            },
          });
          // Un-consume the event id: quarantine is a HOLD, not a verdict.
          // After a human fixes the cause, the provider's replay of this same
          // event must re-evaluate — not bounce off the dedupe table forever.
          await tx.processedWebhook.delete({
            where: {
              provider_providerEventId: {
                provider: event.provider,
                providerEventId: event.providerEventId,
              },
            },
          });
          return { outcome: "amount_mismatch", orderId: order.id };
        }
      }

      // 4) Apply per kind.
      switch (event.kind) {
        case "PENDING": {
          await recordPayment(
            // never regress a finished payment row back to PENDING
            ["CONFIRMED", "UNDERPAID", "EXPIRED", "FAILED"].includes(paymentStatus)
              ? paymentStatus
              : "PENDING",
          );
          return { outcome: "applied", orderId: order.id, orderStatus: order.status };
        }

        case "FAILED": {
          // A failed/cancelled ATTEMPT — the order stays payable (retry).
          await recordPayment("FAILED");
          await tx.auditLog.create({
            data: {
              action: "PAYMENT_ATTEMPT_FAILED",
              entity: "Order",
              entityId: order.id,
              meta: { provider: event.provider, eventId: event.providerEventId },
            },
          });
          return { outcome: "applied", orderId: order.id, orderStatus: order.status };
        }

        case "UNDERPAID":
        case "EXPIRED": {
          const to: OrderStatus = event.kind === "UNDERPAID" ? "UNDERPAID" : "EXPIRED";
          await recordPayment(paymentStatus);
          // Atomic CAS — only moves the order if the transition is legal NOW.
          const moved = await tx.order.updateMany({
            where: { id: order.id, status: { in: allowedFrom(to) } },
            data: { status: to },
          });
          if (moved.count === 0) {
            // Out-of-order webhook (e.g. `expired` after `paid`) — record, skip.
            return {
              outcome: "ignored",
              reason: `stale_${event.kind.toLowerCase()}_for_${order.status}`,
              orderId: order.id,
            };
          }
          await tx.auditLog.create({
            data: {
              action: `ORDER_${to}`,
              entity: "Order",
              entityId: order.id,
              meta: { provider: event.provider, eventId: event.providerEventId },
            },
          });
          return { outcome: "applied", orderId: order.id, orderStatus: to };
        }

        case "CONFIRMED": {
          // CAS to PAID — under concurrent confirmations exactly one wins,
          // so the escrow hold below is written exactly once.
          const moved = await tx.order.updateMany({
            where: { id: order.id, status: { in: allowedFrom("PAID") } },
            data: { status: "PAID", paymentProvider: event.provider },
          });

          if (moved.count === 0) {
            await recordPayment("CONFIRMED");
            if (order.status === "PAID" || order.status === "DELIVERED" || order.status === "COMPLETED") {
              // pure replay / second provider event for an already-paid order
              return { outcome: "ignored", reason: "already_paid", orderId: order.id };
            }
            // Money arrived for a CANCELLED/EXPIRED/REFUNDED order — needs a
            // human (manual refund). Loud audit trail, surfaced to Sentry upstream.
            await tx.auditLog.create({
              data: {
                action: "PAYMENT_FOR_DEAD_ORDER",
                entity: "Order",
                entityId: order.id,
                meta: {
                  provider: event.provider,
                  eventId: event.providerEventId,
                  orderStatus: order.status,
                },
              },
            });
            return { outcome: "ignored", reason: "payment_for_dead_order", orderId: order.id };
          }

          await recordPayment("CONFIRMED");

          // 5) Escrow hold = order.totalMinor (subtotal + buyer platform fee —
          // docs/FEES.md "Escrow money flow"). Held on the seller's wallet
          // ledger but EXCLUDED from their available balance until release.
          const wallet = await tx.wallet.upsert({
            where: { sellerProfileId: order.sellerId },
            create: { sellerProfileId: order.sellerId, currency: order.currency },
            update: {},
            select: { id: true },
          });

          // Serialize concurrent ledger appends per wallet so the
          // balanceAfterMinor audit snapshot can't interleave.
          await tx.$queryRaw`SELECT id FROM "Wallet" WHERE id = ${wallet.id} FOR UPDATE`;

          const [credits, debits] = await Promise.all([
            tx.ledgerEntry.aggregate({
              where: { walletId: wallet.id, type: "CREDIT" },
              _sum: { amountMinor: true },
            }),
            tx.ledgerEntry.aggregate({
              where: { walletId: wallet.id, type: "DEBIT" },
              _sum: { amountMinor: true },
            }),
          ]);
          const grossBefore =
            (credits._sum.amountMinor ?? 0) - (debits._sum.amountMinor ?? 0);
          const balanceAfterMinor = grossBefore + order.totalMinor;

          await tx.ledgerEntry.create({
            data: {
              walletId: wallet.id,
              orderId: order.id,
              type: "CREDIT",
              reason: "ESCROW_HOLD",
              amountMinor: order.totalMinor,
              balanceAfterMinor,
            },
          });
          await tx.wallet.update({
            where: { id: wallet.id },
            data: { cachedBalanceMinor: balanceAfterMinor },
          });

          // 6) Stock: decrement now that money is real. Conditional update —
          // if another paid order already consumed the stock, we DON'T block
          // the PAID (we have the buyer's money); we flag it for admins.
          const stocked = await tx.listing.updateMany({
            where: { id: order.listingId, stock: { gte: order.qty } },
            data: { stock: { decrement: order.qty } },
          });
          let oversold = false;
          if (stocked.count === 0) {
            oversold = true;
            await tx.auditLog.create({
              data: {
                action: "LISTING_OVERSOLD",
                entity: "Listing",
                entityId: order.listingId,
                meta: { orderId: order.id, qty: order.qty },
              },
            });
          } else {
            // Sold out → close the listing (only if it was still ACTIVE).
            await tx.listing.updateMany({
              where: { id: order.listingId, stock: { lte: 0 }, status: "ACTIVE" },
              data: { status: "SOLD" },
            });
          }

          await tx.auditLog.create({
            data: {
              action: "ORDER_PAID",
              entity: "Order",
              entityId: order.id,
              meta: {
                provider: event.provider,
                eventId: event.providerEventId,
                escrowHoldMinor: order.totalMinor,
              },
            },
          });

          // Auto-delivery (Step 19) runs POST-COMMIT (below) in its own short transaction so the
          // payment tx stays short and doesn't contend with the seller-wallet escrow lock.
          return {
            outcome: "applied",
            orderId: order.id,
            orderStatus: "PAID",
            oversold,
            instant: order.listing.deliveryType === "INSTANT",
            listingId: order.listingId,
          };
        }
      }
  });

  // Post-commit fraud signals (Prompt 16): wash-trade + micro-order ring run
  // ONLY once the order has truly reached PAID. Fire-and-forget — never affects
  // the webhook response (the provider just needs a 200).
  if (result.outcome === "applied" && result.orderStatus === "PAID") {
    void db.order
      .findUnique({
        where: { id: result.orderId },
        select: { buyerId: true, sellerId: true },
      })
      .then((o) => {
        if (!o) return;
        fireFraudSignal("suspected_wash_trade", checkWashTrade(o.buyerId, o.sellerId, result.orderId));
        fireFraudSignal("micro_order_ring", checkMicroOrderRing(o.buyerId, o.sellerId));
      })
      .catch(() => {});

    // Step 19: auto / instant delivery — POST-COMMIT, in its own short tx (no escrow-lock contention).
    // Awaited so the item is handed over before the webhook returns. A stockout / missing key NEVER
    // fails the (already-committed) payment — the order just falls back to MANUAL delivery.
    if (result.instant && result.listingId) {
      try {
        await autoDeliver(result.orderId, result.listingId);
        result.autoDelivered = true;
        void notifyOrderEvent(result.orderId, "DELIVERED").catch(() => {});
        if ((await getDeliveryItemCount(result.listingId)) === 0) {
          await pauseListingOnStockout(result.listingId);
        }
      } catch (e) {
        result.deliveryStockout = true;
        if (!(e instanceof DeliveryStockoutError)) {
          captureException(e); // unexpected — payment is fine, delivery falls back to MANUAL
        }
        void notifyOrderEvent(result.orderId, "PAID").catch(() => {});
        void db.fraudFlag
          .upsert({
            where: { targetId_reason: { targetId: result.orderId, reason: "auto_delivery_stockout" } },
            create: {
              targetType: "ORDER",
              targetId: result.orderId,
              reason: "auto_delivery_stockout",
              severity: "LOW",
              autoDetected: true,
              metadata: { listingId: result.listingId },
            },
            update: {},
          })
          .catch(() => {});
      }
    } else {
      // Step 22: payment cleared (manual delivery) → tell the seller to deliver + the buyer it's safe.
      void notifyOrderEvent(result.orderId, "PAID").catch(() => {});
    }
  }

  return result;
  // A thrown error here (DB fault mid-transaction) rolls EVERYTHING back,
  // including the dedupe row — the provider's retry will reprocess cleanly.
}
