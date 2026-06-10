import {
  Prisma,
  type FraudFlag,
  type FraudSeverity,
  type FraudTargetType,
  type FraudAutoAction,
} from "@prisma/client";
import { db } from "@/lib/db";
import { FRAUD_CONFIG } from "@/config/fraud";
import { holdPayout, freezeListing } from "@/server/services/fraud/actions";

/**
 * Layered fraud signals (Prompt 16). Each returns the flag it raised (or null).
 * ALL are fire-and-forget at call sites — they must never crash the main flow.
 * Flags upsert on [targetId, reason] (no duplicates); HIGH/CRITICAL also write
 * an AuditLog; auto-actions run inside the SAME transaction as the upsert.
 *
 * AI signals (listing/message scam scoring) are intentionally deferred to the
 * AI layer (Prompt 23 / lib/ai.ts). The rule-based scam-phrase signal (S7)
 * covers the highest-value listing case synchronously here.
 */

type Tx = Prisma.TransactionClient;

const RISK_BY_SEVERITY: Record<FraudSeverity, number> = {
  LOW: 15,
  MEDIUM: 40,
  HIGH: 70,
  CRITICAL: 100,
};

/**
 * Upsert a flag (respecting an admin's prior DISMISSED/ACTIONED decision — we
 * refresh evidence but don't silently re-open). Writes AuditLog for HIGH/
 * CRITICAL. Runs the optional auto-action inside the same transaction.
 */
async function raiseFlag(
  input: {
    targetType: FraudTargetType;
    targetId: string;
    reason: string;
    severity: FraudSeverity;
    autoAction?: FraudAutoAction;
    metadata?: Prisma.InputJsonValue;
  },
  runAction?: (tx: Tx, flagId: string) => Promise<void>,
): Promise<FraudFlag> {
  const riskScore = RISK_BY_SEVERITY[input.severity];
  return db.$transaction(async (tx) => {
    const flag = await tx.fraudFlag.upsert({
      where: { targetId_reason: { targetId: input.targetId, reason: input.reason } },
      create: {
        targetType: input.targetType,
        targetId: input.targetId,
        reason: input.reason,
        severity: input.severity,
        autoAction: input.autoAction ?? "NONE",
        riskScore,
        metadata: input.metadata ?? {},
      },
      update: {
        severity: input.severity,
        riskScore,
        metadata: input.metadata ?? {},
      },
    });

    if (input.severity === "HIGH" || input.severity === "CRITICAL") {
      await tx.auditLog.create({
        data: {
          action: "FRAUD_FLAG_RAISED",
          entity: "FraudFlag",
          entityId: flag.id,
          meta: {
            reason: input.reason,
            severity: input.severity,
            targetType: input.targetType,
            targetId: input.targetId,
          },
        },
      });
    }

    if (runAction) await runAction(tx, flag.id);
    return flag;
  });
}

/** Resolve a SellerProfile.id → its owner User.id (seller-level flags key on userId). */
async function sellerUserId(sellerId: string): Promise<string | null> {
  const p = await db.sellerProfile.findUnique({
    where: { id: sellerId },
    select: { userId: true },
  });
  return p?.userId ?? null;
}

async function hasActiveFlag(targetId: string, reasons: string[]): Promise<boolean> {
  const f = await db.fraudFlag.findFirst({
    where: { targetId, reason: { in: reasons }, status: { in: ["OPEN", "REVIEWING"] } },
    select: { id: true },
  });
  return f !== null;
}

const DAY = 86_400_000;

// ---------------------------------------------------------------------------
// Layer 1 — Account integrity
// ---------------------------------------------------------------------------

/** S1: >N accounts logging in from the same IP in 24h. */
export async function checkIpMultiAccount(
  userId: string,
  ip: string,
): Promise<FraudFlag | null> {
  if (!ip || ip === "unknown") return null;
  const since = new Date(Date.now() - DAY);
  const count = await db.user.count({
    where: { lastLoginIp: ip, createdAt: { gte: since } },
  });
  if (count <= FRAUD_CONFIG.IP_ACCOUNTS_PER_24H) return null;
  return raiseFlag({
    targetType: "USER",
    targetId: userId,
    reason: "ip_multi_account",
    severity: "HIGH",
    metadata: { ip, accountsFromIp24h: count },
  });
}

/** S2: same device fingerprint across multiple accounts. */
export async function checkDeviceMultiAccount(
  userId: string,
  fingerprint: string,
  ip: string,
): Promise<FraudFlag | null> {
  const others = await db.deviceFingerprint.findMany({
    where: { fingerprint, userId: { not: userId } },
    select: { userId: true },
    distinct: ["userId"],
    take: 5,
  });
  if (others.length < FRAUD_CONFIG.DEVICE_ACCOUNTS_TOTAL) return null;

  const seller = await db.sellerProfile.findUnique({
    where: { userId },
    select: { id: true },
  });
  return raiseFlag(
    {
      targetType: "USER",
      targetId: userId,
      reason: "device_multi_account",
      severity: "HIGH",
      autoAction: seller ? "HOLD_PAYOUT" : "NONE",
      metadata: { fingerprint, ip, collidingUserIds: others.map((o) => o.userId) },
    },
    seller ? (tx, flagId) => holdPayout(tx, seller.id, flagId) : undefined,
  );
}

// ---------------------------------------------------------------------------
// Layer 2 — Transaction fraud
// ---------------------------------------------------------------------------

/** S3: card-testing / order velocity (>N orders in 1h). */
export async function checkOrderVelocity(buyerId: string): Promise<FraudFlag | null> {
  const since = new Date(Date.now() - 60 * 60_000);
  const count = await db.order.count({
    where: { buyerId, createdAt: { gte: since } },
  });
  if (count <= FRAUD_CONFIG.ORDERS_PER_HOUR_BUYER) return null;
  return raiseFlag({
    targetType: "USER",
    targetId: buyerId,
    reason: "order_velocity_1h",
    severity: "HIGH",
    metadata: { ordersLastHour: count },
  });
}

/** S4: dispute-abuse signals (instant dispute / count / rate). Returns the most severe. */
export async function checkDisputeAbuse(
  buyerId: string,
  orderId: string,
): Promise<FraudFlag | null> {
  let last: FraudFlag | null = null;

  // A — instant dispute (opened soon after order creation)
  const order = await db.order.findUnique({
    where: { id: orderId },
    select: { createdAt: true },
  });
  if (order) {
    const minutes = (Date.now() - order.createdAt.getTime()) / 60_000;
    if (minutes < FRAUD_CONFIG.DISPUTE_WITHIN_MINUTES) {
      last = await raiseFlag({
        targetType: "USER",
        targetId: buyerId,
        reason: "instant_dispute",
        severity: "MEDIUM",
        metadata: { orderId, minutesAfterOrder: Math.round(minutes) },
      });
    }
  }

  // B — too many disputes in 30 days
  const since = new Date(Date.now() - 30 * DAY);
  const disputeCount = await db.dispute.count({
    where: { openedById: buyerId, createdAt: { gte: since } },
  });
  if (disputeCount > FRAUD_CONFIG.DISPUTE_COUNT_30D) {
    last = await raiseFlag({
      targetType: "USER",
      targetId: buyerId,
      reason: "dispute_count_30d",
      severity: "HIGH",
      metadata: { disputes30d: disputeCount },
    });
  }

  // C — high dispute-to-order ratio (needs ≥3 completed orders)
  const [completed, totalDisputes] = await Promise.all([
    db.order.count({ where: { buyerId, status: "COMPLETED" } }),
    db.dispute.count({ where: { openedById: buyerId } }),
  ]);
  if (completed >= 3) {
    const rate = totalDisputes / completed;
    if (rate > FRAUD_CONFIG.DISPUTE_RATE_THRESHOLD) {
      last = await raiseFlag({
        targetType: "USER",
        targetId: buyerId,
        reason: "dispute_rate_abuse",
        severity: "HIGH",
        metadata: { disputeRate: Number(rate.toFixed(2)), completed, totalDisputes },
      });
      // Escalate to CRITICAL if also an IP multi-account.
      if (await hasActiveFlag(buyerId, ["ip_multi_account"])) {
        last = await raiseFlag({
          targetType: "USER",
          targetId: buyerId,
          reason: "dispute_abuse_ring",
          severity: "CRITICAL",
          metadata: { disputeRate: Number(rate.toFixed(2)) },
        });
      }
    }
  }

  return last;
}

// ---------------------------------------------------------------------------
// Layer 3 — Listing integrity
// ---------------------------------------------------------------------------

async function loadListingForSignal(listingId: string) {
  return db.listing.findUnique({
    where: { id: listingId },
    select: {
      id: true,
      sellerId: true,
      categoryId: true,
      priceMinor: true,
      title: true,
      description: true,
      seller: { select: { totalSales: true } },
    },
  });
}

/** S5: new-seller price anomaly (priced well below category average). */
export async function checkListingPriceAnomaly(
  listingId: string,
): Promise<FraudFlag | null> {
  const listing = await loadListingForSignal(listingId);
  if (!listing || listing.seller.totalSales >= FRAUD_CONFIG.LOW_SALES_THRESHOLD)
    return null;

  const agg = await db.listing.aggregate({
    where: {
      categoryId: listing.categoryId,
      status: "ACTIVE",
      id: { not: listing.id },
    },
    _avg: { priceMinor: true },
    _count: { _all: true },
  });
  if (agg._count._all < FRAUD_CONFIG.MIN_COMPARABLE_LISTINGS) return null;
  const avg = agg._avg.priceMinor ?? 0;
  if (avg <= 0 || listing.priceMinor >= avg * FRAUD_CONFIG.PRICE_BELOW_AVG_FACTOR)
    return null;

  const suspicious = await hasActiveFlag(
    (await sellerUserId(listing.sellerId)) ?? "",
    ["ip_multi_account", "device_multi_account"],
  );
  return raiseFlag(
    {
      targetType: "LISTING",
      targetId: listing.id,
      reason: "new_seller_price_anomaly",
      severity: "HIGH",
      autoAction: suspicious ? "FREEZE_LISTING" : "NONE",
      metadata: { priceMinor: listing.priceMinor, categoryAvgMinor: Math.round(avg) },
    },
    suspicious ? (tx, flagId) => freezeListing(tx, listing.id, flagId) : undefined,
  );
}

/** S6: new-seller listing at very high value. */
export async function checkNewSellerHighValue(
  listingId: string,
): Promise<FraudFlag | null> {
  const listing = await loadListingForSignal(listingId);
  if (!listing || listing.seller.totalSales >= FRAUD_CONFIG.LOW_SALES_THRESHOLD)
    return null;
  if (listing.priceMinor <= FRAUD_CONFIG.LOW_SALES_HIGH_VALUE_THRESHOLD_MINOR)
    return null;
  return raiseFlag({
    targetType: "LISTING",
    targetId: listing.id,
    reason: "new_seller_high_value",
    severity: "MEDIUM",
    metadata: { priceMinor: listing.priceMinor },
  });
}

/** S7: scam phrase in listing title/description → freeze. */
export async function checkListingScamPhrases(
  listingId: string,
): Promise<FraudFlag | null> {
  const listing = await loadListingForSignal(listingId);
  if (!listing) return null;
  const haystack = `${listing.title}\n${listing.description}`.toLowerCase();
  const matched = FRAUD_CONFIG.SCAM_PHRASES.find((p) => haystack.includes(p));
  if (!matched) return null;
  return raiseFlag(
    {
      targetType: "LISTING",
      targetId: listing.id,
      reason: "scam_phrase_content",
      severity: "MEDIUM",
      autoAction: "FREEZE_LISTING",
      metadata: { matchedPhrase: matched },
    },
    (tx, flagId) => freezeListing(tx, listing.id, flagId),
  );
}

// ---------------------------------------------------------------------------
// Layer 4 — Review integrity
// ---------------------------------------------------------------------------

/** S8: review velocity (many reviews for a seller in 24h = ring behavior). */
export async function checkReviewVelocity(
  sellerId: string,
): Promise<FraudFlag | null> {
  const since = new Date(Date.now() - DAY);
  const count = await db.review.count({
    where: { sellerId, createdAt: { gte: since } },
  });
  if (count <= FRAUD_CONFIG.REVIEW_VELOCITY_PER_DAY) return null;
  const uid = await sellerUserId(sellerId);
  if (!uid) return null;
  return raiseFlag({
    targetType: "USER",
    targetId: uid,
    reason: "review_velocity",
    severity: "MEDIUM",
    metadata: { sellerId, reviews24h: count },
  });
}

/** S9: multiple reviews for a seller from the same IP. */
export async function checkReviewSameIp(
  sellerId: string,
  reviewerUserId: string,
): Promise<FraudFlag | null> {
  const reviewer = await db.user.findUnique({
    where: { id: reviewerUserId },
    select: { lastLoginIp: true },
  });
  const ip = reviewer?.lastLoginIp;
  if (!ip || ip === "unknown") return null;

  const count = await db.review.count({
    where: { sellerId, buyer: { lastLoginIp: ip } },
  });
  if (count <= FRAUD_CONFIG.REVIEW_SAME_IP_THRESHOLD) return null;
  const uid = await sellerUserId(sellerId);
  if (!uid) return null;
  return raiseFlag({
    targetType: "USER",
    targetId: uid,
    reason: "review_same_ip",
    severity: "MEDIUM",
    metadata: { sellerId, ip, reviewsFromIp: count },
  });
}

// ---------------------------------------------------------------------------
// Layer 5 — Collusion / wash-trade
// ---------------------------------------------------------------------------

/** S10: buyer and seller share an IP or device → suspected wash trade (CRITICAL). */
export async function checkWashTrade(
  buyerId: string,
  sellerId: string,
  orderId: string,
): Promise<FraudFlag | null> {
  const [buyer, profile] = await Promise.all([
    db.user.findUnique({ where: { id: buyerId }, select: { lastLoginIp: true } }),
    db.sellerProfile.findUnique({
      where: { id: sellerId },
      select: { userId: true },
    }),
  ]);
  if (!profile) return null;
  if (buyerId === profile.userId) return null; // same account is already blocked at create

  const sellerUser = await db.user.findUnique({
    where: { id: profile.userId },
    select: { lastLoginIp: true },
  });

  let matchField: string | null = null;
  if (
    buyer?.lastLoginIp &&
    buyer.lastLoginIp !== "unknown" &&
    buyer.lastLoginIp === sellerUser?.lastLoginIp
  ) {
    matchField = "ip";
  } else {
    // shared device fingerprint?
    const buyerFps = await db.deviceFingerprint.findMany({
      where: { userId: buyerId },
      select: { fingerprint: true },
    });
    if (buyerFps.length > 0) {
      const shared = await db.deviceFingerprint.findFirst({
        where: {
          userId: profile.userId,
          fingerprint: { in: buyerFps.map((f) => f.fingerprint) },
        },
        select: { fingerprint: true },
      });
      if (shared) matchField = "device";
    }
  }
  if (!matchField) return null;

  const order = await db.order.findUnique({
    where: { id: orderId },
    select: { listingId: true },
  });
  return raiseFlag(
    {
      targetType: "USER",
      targetId: profile.userId,
      reason: "suspected_wash_trade",
      severity: "CRITICAL",
      autoAction: "HOLD_PAYOUT",
      metadata: { buyerId, sellerId, orderId, match: matchField },
    },
    async (tx, flagId) => {
      await holdPayout(tx, sellerId, flagId);
      if (order?.listingId) await freezeListing(tx, order.listingId, flagId);
    },
  );
}

/** S11: repeated micro-orders between the same buyer→seller (reputation farming). */
export async function checkMicroOrderRing(
  buyerId: string,
  sellerId: string,
): Promise<FraudFlag | null> {
  const count = await db.order.count({
    where: {
      buyerId,
      sellerId,
      status: { in: ["PAID", "DELIVERED", "COMPLETED"] },
      unitPriceMinor: { lt: FRAUD_CONFIG.WASH_TRADE_ORDER_VALUE_MAX_MINOR },
    },
  });
  if (count <= FRAUD_CONFIG.WASH_TRADE_ORDERS_FOR_SIGNAL) return null;
  const uid = await sellerUserId(sellerId);
  if (!uid) return null;
  return raiseFlag({
    targetType: "USER",
    targetId: uid,
    reason: "micro_order_ring",
    severity: "MEDIUM",
    metadata: { buyerId, sellerId, microOrders: count },
  });
}

// ---------------------------------------------------------------------------
// Layer 6 — Chargeback / refund abuse
// ---------------------------------------------------------------------------

/** S12: seller refund rate above threshold → hold payout. */
export async function checkSellerRefundRate(
  sellerId: string,
): Promise<FraudFlag | null> {
  const [total, refunded] = await Promise.all([
    db.order.count({
      where: { sellerId, status: { in: ["COMPLETED", "REFUNDED", "DISPUTED"] } },
    }),
    db.order.count({ where: { sellerId, status: "REFUNDED" } }),
  ]);
  if (total < FRAUD_CONFIG.REFUND_MIN_ORDERS) return null;
  const rate = refunded / total;
  if (rate <= FRAUD_CONFIG.REFUND_RATE_THRESHOLD) return null;
  const uid = await sellerUserId(sellerId);
  if (!uid) return null;
  return raiseFlag(
    {
      targetType: "USER",
      targetId: uid,
      reason: "high_refund_rate",
      severity: "HIGH",
      autoAction: "HOLD_PAYOUT",
      metadata: { refundRate: Number(rate.toFixed(2)), refunded, total },
    },
    (tx, flagId) => holdPayout(tx, sellerId, flagId),
  );
}
