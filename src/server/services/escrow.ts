import {
  Prisma,
  type LedgerReason,
  type LedgerType,
  type OrderStatus,
} from "@prisma/client";
import { captureException } from "@sentry/nextjs";
import { db } from "@/lib/db";
import { siteConfig } from "@/config/site";
import { recomputeSellerTrustAndLevel } from "@/server/services/trust-score";
import { fireFraudSignal } from "@/server/services/fraud/dispatch";
import {
  checkDisputeAbuse,
  checkSellerRefundRate,
} from "@/server/services/fraud/signals";
import {
  notifyDisputeEvent,
  notifyOrderEvent,
} from "@/server/services/notifications";
import { checkAndAwardReferralBonus } from "@/server/services/referral";
import { ticketForDispute } from "@/server/services/work-queue";
import { awardPoints } from "@/server/services/loyalty";
import { buyerEarnPoints, sellerEarnPoints } from "@/config/loyalty";
import { checkAndAwardMilestoneBadges } from "@/server/services/badges";
import { captureServerEvent } from "@/lib/posthog";

/**
 * Escrow lifecycle (Step 10) — guardrails §1 (append-only ledger), §3 (state
 * machine), §4 (escrow). SERVER-SIDE ONLY; called from server actions / the
 * cron route after auth. Every money move is a LedgerEntry written INSIDE the
 * same transaction as the status change.
 *
 * RELEASE IS IDEMPOTENT via an atomic compare-and-set on `order.status` (the
 * same pattern Step 09's webhook uses): exactly one caller ever moves
 * DELIVERED → COMPLETED, so the seller is paid EXACTLY ONCE even under a double
 * buyer-confirm or a cron sweep that fires twice.
 *
 * Money split on completion (docs/FEES.md "Escrow money flow"), $1,000 sale:
 *   at PAID (Step 09)       CREDIT ESCROW_HOLD   1050   seller wallet (held)
 *   at COMPLETED — ONE transaction:
 *     DEBIT  ESCROW_RELEASE  1050   seller wallet  (clears the hold)
 *     CREDIT SALE             920   seller wallet  (now available)
 *     CREDIT FEE               50   PLATFORM wallet (buyer platform-fee revenue)
 *     CREDIT FEE               80   PLATFORM wallet (seller-commission revenue)
 *   Reconciles: 920 + 50 + 80 = 1050. The two FEE rows live on the single GETX
 *   PLATFORM wallet so the seller's ledger stays clean (only their real money).
 */

export class EscrowServiceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EscrowServiceError";
  }
}

/** Buyer-protection window: funds auto-release this many days after delivery. */
export const AUTO_RELEASE_DAYS = siteConfig.escrow.autoReleaseDays;
const AUTO_RELEASE_MS = AUTO_RELEASE_DAYS * 24 * 60 * 60 * 1000;

/** Fixed id of the single GETX revenue wallet (kind = PLATFORM, no seller). */
export const PLATFORM_WALLET_ID = "platform";

/** Most orders one auto-release sweep releases (back-pressure; cron retries the rest). */
const AUTO_RELEASE_BATCH = 200;

type Tx = Prisma.TransactionClient;

// --- ledger helpers ---------------------------------------------------------

/**
 * Lock a wallet row (SELECT … FOR UPDATE) so concurrent ledger appends to it
 * can't interleave their balance snapshots, and return its current GROSS
 * balance (ΣCREDIT − ΣDEBIT) — consistent with Step 09's escrow-hold append.
 */
async function lockWalletGross(tx: Tx, walletId: string): Promise<number> {
  await tx.$queryRaw`SELECT id FROM "Wallet" WHERE id = ${walletId} FOR UPDATE`;
  const [credits, debits] = await Promise.all([
    tx.ledgerEntry.aggregate({
      where: { walletId, type: "CREDIT" },
      _sum: { amountMinor: true },
    }),
    tx.ledgerEntry.aggregate({
      where: { walletId, type: "DEBIT" },
      _sum: { amountMinor: true },
    }),
  ]);
  return (credits._sum.amountMinor ?? 0) - (debits._sum.amountMinor ?? 0);
}

/**
 * Append ONE ledger entry, snapshotting the running gross into balanceAfterMinor.
 * The wallet must already be locked by `lockWalletGross`. Returns the new gross
 * so callers can thread several appends together before writing the cache.
 */
async function appendLedger(
  tx: Tx,
  args: {
    walletId: string;
    orderId: string;
    type: LedgerType;
    reason: LedgerReason;
    amountMinor: number;
    grossBefore: number;
  },
): Promise<number> {
  const delta = args.type === "CREDIT" ? args.amountMinor : -args.amountMinor;
  const balanceAfterMinor = args.grossBefore + delta;
  await tx.ledgerEntry.create({
    data: {
      walletId: args.walletId,
      orderId: args.orderId,
      type: args.type,
      reason: args.reason,
      amountMinor: args.amountMinor,
      balanceAfterMinor,
    },
  });
  return balanceAfterMinor;
}

/** Get-or-create a seller's wallet (the escrow hold may have created it at PAID). */
async function ensureSellerWallet(
  tx: Tx,
  sellerProfileId: string,
  currency: string,
): Promise<string> {
  const wallet = await tx.wallet.upsert({
    where: { sellerProfileId },
    create: { sellerProfileId, currency },
    update: {},
    select: { id: true },
  });
  return wallet.id;
}

// --- the release (shared by buyer-confirm AND the auto-release cron) ---------

/**
 * Move a DELIVERED order to COMPLETED and pay out, IDEMPOTENTLY. The CAS
 * `updateMany WHERE status = DELIVERED` is the lock: under concurrent callers
 * exactly one gets count 1 and writes the ledger; everyone else gets count 0
 * and returns "noop" (no second payout). A DISPUTED order is never DELIVERED,
 * so a dispute freezes this automatically.
 */
async function releaseOrder(
  tx: Tx,
  orderId: string,
  allowedFrom: OrderStatus[] = ["DELIVERED"],
): Promise<"released" | "noop"> {
  const moved = await tx.order.updateMany({
    where: { id: orderId, status: { in: allowedFrom } },
    data: { status: "COMPLETED" },
  });
  if (moved.count === 0) return "noop";

  const order = await tx.order.findUniqueOrThrow({
    where: { id: orderId },
    select: {
      buyerId: true,
      sellerId: true,
      qty: true,
      unitPriceMinor: true,
      feeMinor: true,
      sellerFeeMinor: true,
      totalMinor: true,
      currency: true,
      seller: { select: { userId: true } },
    },
  });

  const subtotalMinor = order.unitPriceMinor * order.qty;
  const commissionMinor = order.sellerFeeMinor; // snapshot taken at order creation
  const platformFeeMinor = order.feeMinor; // buyer platform fee (escrowed too)
  const saleMinor = subtotalMinor - commissionMinor; // the seller's actual take

  // Defensive: never write money that doesn't reconcile to the held total.
  if (
    saleMinor < 0 ||
    saleMinor + platformFeeMinor + commissionMinor !== order.totalMinor
  ) {
    throw new EscrowServiceError(
      `Escrow release reconciliation failed for order ${orderId}: ` +
        `sale ${saleMinor} + platformFee ${platformFeeMinor} + commission ${commissionMinor} ≠ total ${order.totalMinor}.`,
    );
  }

  // Seller wallet: clear the hold, credit the sale (becomes available balance).
  const sellerWalletId = await ensureSellerWallet(tx, order.sellerId, order.currency);
  let sellerGross = await lockWalletGross(tx, sellerWalletId);
  sellerGross = await appendLedger(tx, {
    walletId: sellerWalletId,
    orderId,
    type: "DEBIT",
    reason: "ESCROW_RELEASE",
    amountMinor: order.totalMinor,
    grossBefore: sellerGross,
  });
  sellerGross = await appendLedger(tx, {
    walletId: sellerWalletId,
    orderId,
    type: "CREDIT",
    reason: "SALE",
    amountMinor: saleMinor,
    grossBefore: sellerGross,
  });
  await tx.wallet.update({
    where: { id: sellerWalletId },
    data: { cachedBalanceMinor: sellerGross },
  });

  // Platform wallet: GETX revenue = platform fee + commission, two FEE rows.
  if (platformFeeMinor + commissionMinor > 0) {
    // Race-safe get-or-create of the singleton (INSERT … ON CONFLICT DO NOTHING):
    // two first-ever releases creating it concurrently can't poison the tx with a
    // P2002 the way upsert's find-then-create would (same trick as Step 09).
    await tx.wallet.createMany({
      data: [{ id: PLATFORM_WALLET_ID, kind: "PLATFORM", currency: order.currency }],
      skipDuplicates: true,
    });
    let platGross = await lockWalletGross(tx, PLATFORM_WALLET_ID);
    if (platformFeeMinor > 0) {
      platGross = await appendLedger(tx, {
        walletId: PLATFORM_WALLET_ID,
        orderId,
        type: "CREDIT",
        reason: "FEE",
        amountMinor: platformFeeMinor,
        grossBefore: platGross,
      });
    }
    if (commissionMinor > 0) {
      platGross = await appendLedger(tx, {
        walletId: PLATFORM_WALLET_ID,
        orderId,
        type: "CREDIT",
        reason: "FEE",
        amountMinor: commissionMinor,
        grossBefore: platGross,
      });
    }
    await tx.wallet.update({
      where: { id: PLATFORM_WALLET_ID },
      data: { cachedBalanceMinor: platGross },
    });
  }

  // Seller reputation: one more completed sale (totalSales = lifetime sale count).
  const updatedSeller = await tx.sellerProfile.update({
    where: { id: order.sellerId },
    data: { totalSales: { increment: 1 } },
    select: { totalSales: true },
  });
  // Community milestone badges (Step 27) — idempotent, never throws (safe inside the money tx).
  await checkAndAwardMilestoneBadges(order.seller.userId, updatedSeller.totalSales, tx);
  // Activation milestone (Prompt 14): stamp the seller's FIRST completed sale.
  await tx.sellerProfile.updateMany({
    where: { id: order.sellerId, firstSaleAt: null },
    data: { firstSaleAt: new Date() },
  });

  await tx.auditLog.create({
    data: {
      action: "ORDER_COMPLETED",
      entity: "Order",
      entityId: orderId,
      meta: {
        saleMinor,
        platformFeeMinor,
        commissionMinor,
        totalMinor: order.totalMinor,
      },
    },
  });

  // Loyalty earn (Step 21): buyer on subtotal, seller on net take. Idempotent (unique index +
  // skipDuplicates) so a retried release never double-awards and never throws inside this tx.
  await awardPoints(tx, order.buyerId, buyerEarnPoints(subtotalMinor), "PURCHASE", orderId);
  await awardPoints(tx, order.seller.userId, sellerEarnPoints(saleMinor), "SALE", orderId);

  // Analytics (Step 31): the server-truth completion event — IDs + amount only, never PII.
  captureServerEvent("order_completed", order.buyerId, {
    orderId,
    sellerId: order.sellerId,
    amountMinor: subtotalMinor,
  });

  return "released";
}

// --- seller: deliver --------------------------------------------------------

/**
 * Seller hands over the goods on a PAID order → DELIVERED, starting the 3-day
 * buyer-protection clock (autoReleaseAt). Re-checks ownership; the PAID → DELIVERED
 * transition is a CAS so a double submit delivers at most once.
 */
export async function markDelivered(
  sellerUserId: string,
  orderId: string,
  content: string,
): Promise<void> {
  await db.$transaction(async (tx) => {
    const order = await tx.order.findUnique({
      where: { id: orderId },
      select: { status: true, seller: { select: { userId: true } } },
    });
    // Not the seller → identical answer to "not found" (no order enumeration).
    if (!order || order.seller.userId !== sellerUserId) {
      throw new EscrowServiceError("Order not found.");
    }

    const now = new Date();
    // Every order uses the single standard escrow window (O-T16 — Shield removed).
    const autoReleaseAt = new Date(now.getTime() + AUTO_RELEASE_MS);
    const moved = await tx.order.updateMany({
      where: { id: orderId, status: "PAID" },
      data: { status: "DELIVERED", deliveredAt: now, autoReleaseAt },
    });
    if (moved.count === 0) {
      throw new EscrowServiceError(
        order.status === "DELIVERED" || order.status === "COMPLETED"
          ? "This order has already been delivered."
          : order.status === "DISPUTED"
            ? "This order is under dispute — you can't deliver it right now."
            : "You can only deliver an order once its payment has cleared.",
      );
    }

    // Store the hand-over payload (sensitive — gated to buyer/seller/admin reads).
    await tx.orderDelivery.upsert({
      where: { orderId },
      create: { orderId, content },
      update: { content },
    });

    await tx.auditLog.create({
      data: {
        action: "ORDER_DELIVERED",
        entity: "Order",
        entityId: orderId,
        meta: { autoReleaseAt: autoReleaseAt.toISOString() },
      },
    });
  });

  // Post-commit: tell the buyer to confirm receipt (Step 22). Never await — a
  // notification failure must not undo a delivered order.
  void notifyOrderEvent(orderId, "DELIVERED").catch(captureException);
}

// --- buyer: confirm receipt (release now) -----------------------------------

/**
 * Buyer confirms the delivery is good → release escrow to the seller now
 * (skips the 3-day wait). Ownership-checked; the release itself is idempotent.
 */
export async function confirmReceipt(
  buyerUserId: string,
  orderId: string,
): Promise<void> {
  let sellerProfileId = "";

  await db.$transaction(async (tx) => {
    const order = await tx.order.findUnique({
      where: { id: orderId },
      select: { status: true, buyerId: true, sellerId: true },
    });
    if (!order || order.buyerId !== buyerUserId) {
      throw new EscrowServiceError("Order not found.");
    }

    const result = await releaseOrder(tx, orderId);
    if (result === "noop") {
      throw new EscrowServiceError(
        order.status === "COMPLETED"
          ? "This order is already complete — the seller has been paid."
          : order.status === "DISPUTED"
            ? "This order is under dispute — our team will resolve it."
            : "This order isn't ready to confirm yet — wait for the seller to deliver.",
      );
    }
    sellerProfileId = order.sellerId;
  });

  if (sellerProfileId) {
    void recomputeSellerTrustAndLevel(sellerProfileId).catch(captureException);
    // Step 22: order completed → notify buyer + seller (funds released).
    void notifyOrderEvent(orderId, "COMPLETED").catch(captureException);
    // Prompt 22: this may be the referred buyer's first completed order → award referrer (CAS-idempotent).
    void checkAndAwardReferralBonus(buyerUserId).catch(captureException);
  }
}

// --- buyer: open dispute (freeze release) -----------------------------------

/**
 * Buyer raises a dispute on a PAID or DELIVERED order → DISPUTED, which freezes
 * release (the auto-release sweep + buyer-confirm both require status DELIVERED).
 * Step 15 resolves it (admin/AI) into COMPLETED or REFUNDED.
 */
export async function openDispute(
  buyerUserId: string,
  orderId: string,
  reason: string,
): Promise<void> {
  await db.$transaction(async (tx) => {
    const order = await tx.order.findUnique({
      where: { id: orderId },
      select: { status: true, buyerId: true },
    });
    if (!order || order.buyerId !== buyerUserId) {
      throw new EscrowServiceError("Order not found.");
    }

    const moved = await tx.order.updateMany({
      where: { id: orderId, status: { in: ["PAID", "DELIVERED"] } },
      data: { status: "DISPUTED" },
    });
    if (moved.count === 0) {
      throw new EscrowServiceError(
        order.status === "DISPUTED"
          ? "A dispute is already open on this order."
          : order.status === "COMPLETED"
            ? "This order is already complete and can no longer be disputed."
            : "This order can't be disputed in its current state.",
      );
    }

    // Only the CAS winner reaches here, so the unique orderId never collides.
    await tx.dispute.create({
      data: { orderId, openedById: buyerUserId, reason, status: "OPEN" },
    });
    await tx.auditLog.create({
      data: {
        action: "ORDER_DISPUTED",
        entity: "Order",
        entityId: orderId,
        meta: { openedBy: buyerUserId },
      },
    });
  });

  // Fraud signal (Prompt 16): dispute-abuse — fire-and-forget post-commit.
  fireFraudSignal("dispute_abuse", checkDisputeAbuse(buyerUserId, orderId));
  // Step 22: alert the seller (+ admins) that a dispute was opened.
  void notifyDisputeEvent(orderId, "OPENED").catch(captureException);
  // Prompt 24: open an SLA-tracked ops ticket for the queue (fire-and-forget).
  void ticketForDispute(orderId, buyerUserId).catch(captureException);
}

// --- refund (used by dispute resolution / admin — Step 15) -------------------

/**
 * Reverse the escrow hold and mark the order REFUNDED. Only states that still
 * HOLD money (PAID or DISPUTED) can be refunded — never COMPLETED (already
 * released) and never directly from DELIVERED (a dispute must be opened first).
 * Idempotent: a second call finds no PAID/DISPUTED row and is a no-op.
 *
 * Restocks the listing (+qty) since the unit wasn't sold; an auto-SOLD listing
 * (stock had raced to 0) flips back to ACTIVE. CAVEAT: an oversold order (Step 09
 * `LISTING_OVERSOLD`, where stock was NOT decremented) would over-restock — that
 * rare race is flagged for admins, who reconcile inventory manually.
 */
async function refundInTx(
  tx: Tx,
  orderId: string,
  reason: string,
): Promise<"refunded" | "noop"> {
  const order = await tx.order.findUnique({
    where: { id: orderId },
    select: {
      buyerId: true,
      sellerId: true,
      listingId: true,
      qty: true,
      totalMinor: true,
      currency: true,
      loyaltyPointsRedeemed: true,
    },
  });
  if (!order) throw new EscrowServiceError("Order not found.");

  const moved = await tx.order.updateMany({
    where: { id: orderId, status: { in: ["PAID", "DISPUTED"] } },
    data: { status: "REFUNDED" },
  });
  if (moved.count === 0) return "noop";

  // Reverse the hold: a DEBIT REFUND of the full escrowed total closes it out
  // (wallet held = ESCROW_HOLD credits − (ESCROW_RELEASE | REFUND) debits → 0).
  const sellerWalletId = await ensureSellerWallet(tx, order.sellerId, order.currency);
  let gross = await lockWalletGross(tx, sellerWalletId);
  gross = await appendLedger(tx, {
    walletId: sellerWalletId,
    orderId,
    type: "DEBIT",
    reason: "REFUND",
    amountMinor: order.totalMinor,
    grossBefore: gross,
  });
  await tx.wallet.update({
    where: { id: sellerWalletId },
    data: { cachedBalanceMinor: gross },
  });

  // Put the unit back; reactivate it if it had auto-closed as SOLD.
  await tx.listing.update({
    where: { id: order.listingId },
    data: { stock: { increment: order.qty } },
  });
  await tx.listing.updateMany({
    where: { id: order.listingId, status: "SOLD" },
    data: { status: "ACTIVE" },
  });

  // Loyalty (Step 21): give back any points the buyer redeemed on this order via a compensating
  // EARN (PURCHASE_REFUND) — the ledger stays balanced, no rows are ever deleted. Idempotent
  // (one PURCHASE_REFUND per order via the unique index + skipDuplicates).
  if (order.loyaltyPointsRedeemed > 0) {
    await awardPoints(tx, order.buyerId, order.loyaltyPointsRedeemed, "PURCHASE_REFUND", orderId);
  }

  await tx.auditLog.create({
    data: {
      action: "ORDER_REFUNDED",
      entity: "Order",
      entityId: orderId,
      meta: { reason, refundedMinor: order.totalMinor },
    },
  });
  return "refunded";
}

export async function refund(
  orderId: string,
  reason: string,
): Promise<"refunded" | "noop"> {
  const result = await db.$transaction((tx) => refundInTx(tx, orderId, reason));
  if (result === "refunded") {
    fireRefundRateSignal(orderId);
    // Step 22: notify the buyer their order was refunded.
    void notifyOrderEvent(orderId, "REFUNDED").catch(captureException);
  }
  return result;
}

/** Post-commit fraud hook (Prompt 16): a refund may push the seller over the rate threshold. */
function fireRefundRateSignal(orderId: string): void {
  void db.order
    .findUnique({ where: { id: orderId }, select: { sellerId: true } })
    .then((o) => {
      if (o) {
        fireFraudSignal("high_refund_rate", checkSellerRefundRate(o.sellerId));
      }
    })
    .catch(() => {});
}

// --- admin: resolve a dispute (Step 15) -------------------------------------

export type DisputeOutcome = "REFUND_BUYER" | "RELEASE_SELLER";

/**
 * Admin resolves an OPEN dispute, atomically: the dispute status CAS
 * (OPEN → RESOLVED_*) gates idempotency, and the money move (refund the buyer or
 * release to the seller) runs in the SAME transaction. Both money paths reuse the
 * exact escrow ledger logic, so a resolution either fully applies or fully rolls
 * back — never a half-resolved dispute. Caller is responsible for admin auth.
 */
export async function resolveDispute(
  // null = a system (AI Dispute Judge, Step 25) action — AuditLog.actorId is
  // nullable, so a null actor records a non-human resolution cleanly.
  adminUserId: string | null,
  orderId: string,
  outcome: DisputeOutcome,
  note: string,
  // Step 25: when the AI auto-resolves, stamp judgeActorType="AI" ATOMICALLY in
  // the same status CAS below so status + actor + money all move together.
  judgeActorType?: "AI" | "HUMAN",
): Promise<DisputeOutcome> {
  const resolved = await db.$transaction(async (tx) => {
    const dispute = await tx.dispute.findUnique({
      where: { orderId },
      select: { id: true },
    });
    if (!dispute) throw new EscrowServiceError("Dispute not found.");

    // Idempotency gate: only an OPEN dispute resolves, exactly once.
    const claimed = await tx.dispute.updateMany({
      where: { orderId, status: "OPEN" },
      data: {
        status: outcome === "REFUND_BUYER" ? "RESOLVED_BUYER" : "RESOLVED_SELLER",
        resolutionNote: note,
        ...(judgeActorType ? { judgeActorType } : {}),
      },
    });
    if (claimed.count === 0) {
      throw new EscrowServiceError("This dispute has already been resolved.");
    }

    const result =
      outcome === "REFUND_BUYER"
        ? await refundInTx(tx, orderId, note)
        : await releaseOrder(tx, orderId, ["DISPUTED"]);
    // The order should be DISPUTED here; a "noop" means it isn't — roll back.
    if (result === "noop") {
      throw new EscrowServiceError(
        "This order is no longer in a state that can be resolved.",
      );
    }

    await tx.auditLog.create({
      data: {
        actorId: adminUserId,
        action:
          outcome === "REFUND_BUYER"
            ? "DISPUTE_RESOLVED_BUYER"
            : "DISPUTE_RESOLVED_SELLER",
        entity: "Order",
        entityId: orderId,
        // actorType disambiguates a null-actor AI resolution from a human one.
        meta: { disputeId: dispute.id, note, actorType: judgeActorType ?? "HUMAN" },
      },
    });
    return outcome;
  });

  // A buyer-favored resolution is a refund → re-check the seller's refund rate.
  if (resolved === "REFUND_BUYER") fireRefundRateSignal(orderId);
  // Step 22: tell both parties how the dispute was resolved.
  void notifyDisputeEvent(
    orderId,
    resolved === "REFUND_BUYER" ? "RESOLVED_BUYER" : "RESOLVED_SELLER",
  ).catch(captureException);
  return resolved;
}

// --- auto-release sweep (Vercel Cron) ---------------------------------------

export type AutoReleaseSummary = {
  scanned: number;
  released: number;
  /** order ids that threw — surfaced to Sentry by the cron route */
  failed: string[];
  /** true when the batch cap was hit (more may remain for the next sweep) */
  capped: boolean;
};

/**
 * Find DELIVERED orders past their 3-day deadline and release each. Disputed
 * orders are excluded (their status is DISPUTED, not DELIVERED). Each release
 * runs in its OWN transaction so one failure can't roll back the rest, and the
 * CAS inside releaseOrder makes re-running the sweep a no-op (never double-pays).
 */
export async function runAutoRelease(now = new Date()): Promise<AutoReleaseSummary> {
  const due = await db.order.findMany({
    where: { status: "DELIVERED", autoReleaseAt: { lte: now } },
    select: { id: true, sellerId: true, buyerId: true },
    orderBy: { autoReleaseAt: "asc" },
    take: AUTO_RELEASE_BATCH,
  });

  let released = 0;
  const failed: string[] = [];
  const releasedSellerIds: string[] = [];

  for (const { id, sellerId, buyerId } of due) {
    try {
      const r = await db.$transaction((tx) => releaseOrder(tx, id));
      if (r === "released") {
        released += 1;
        releasedSellerIds.push(sellerId);
        // Step 22: auto-release completed this order → notify buyer + seller.
        void notifyOrderEvent(id, "COMPLETED").catch(captureException);
        // Prompt 22: may be the referred buyer's first completed order → award referrer.
        void checkAndAwardReferralBonus(buyerId).catch(captureException);
      }
    } catch (err) {
      console.error(`[auto-release] order ${id} failed`, err);
      failed.push(id);
    }
  }

  // Post-batch: dedupe by seller (one seller can have multiple orders release),
  // then fire-and-forget trust recompute for each.
  const uniqueSellerIds = [...new Set(releasedSellerIds)];
  for (const sid of uniqueSellerIds) {
    void recomputeSellerTrustAndLevel(sid).catch(captureException);
  }

  return {
    scanned: due.length,
    released,
    failed,
    capped: due.length === AUTO_RELEASE_BATCH,
  };
}
