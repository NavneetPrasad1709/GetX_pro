/**
 * Seller trust score + level system (Prompt 11 / Step 17 spec).
 * SERVER-SIDE ONLY.
 *
 * Architecture:
 *  - Pure formula functions (computeTrustScore, computeRiskScore,
 *    resolveSellerLevel) — no DB, fully unit-testable.
 *  - One DB-writing function (recomputeSellerTrustAndLevel) — called as a
 *    fire-and-forget POST-COMMIT side effect from reviews/escrow/kyc.
 *  - Nightly cron at /api/cron/trust-score sweeps all non-overridden sellers.
 */

import { db } from "@/lib/db";
import { broadcastTrustUpdate } from "@/lib/trust-broadcast";
import { captureException } from "@sentry/nextjs";
import type { KycStatus } from "@prisma/client";

// ---------------------------------------------------------------------------
// Seller levels — ordered LOWEST to HIGHEST
// ---------------------------------------------------------------------------

export type SellerLevelId =
  | "BRONZE"
  | "SILVER"
  | "GOLD"
  | "PLATINUM"
  | "ELITE";

export type SellerLevelConfig = {
  id: SellerLevelId;
  label: string;
  color: string; // Tailwind text class
  bgColor: string; // Tailwind bg class
  minTrustScore: number;
  minTotalSales: number;
  requiresKyc: boolean;
  maxDisputeRatePct: number | null;
  perks: {
    commissionDiscountPct: number;
    maxActiveListings: number;
    featuredEligible: boolean;
    payoutSpeedDays: number;
    searchBoostFactor: number;
    badge: string;
  };
};

export const SELLER_LEVELS: SellerLevelConfig[] = [
  {
    id: "BRONZE",
    label: "Bronze",
    color: "text-amber-600",
    bgColor: "bg-amber-600/15",
    minTrustScore: 0,
    minTotalSales: 0,
    requiresKyc: false,
    maxDisputeRatePct: null,
    perks: {
      commissionDiscountPct: 0,
      maxActiveListings: 10,
      featuredEligible: false,
      payoutSpeedDays: 3,
      searchBoostFactor: 1.0,
      badge: "Bronze",
    },
  },
  {
    id: "SILVER",
    label: "Silver",
    color: "text-slate-400",
    bgColor: "bg-slate-400/15",
    minTrustScore: 50,
    minTotalSales: 5,
    requiresKyc: false,
    maxDisputeRatePct: 20,
    perks: {
      commissionDiscountPct: 0.5,
      maxActiveListings: 25,
      featuredEligible: false,
      payoutSpeedDays: 3,
      searchBoostFactor: 1.05,
      badge: "Silver",
    },
  },
  {
    id: "GOLD",
    label: "Gold",
    color: "text-yellow-400",
    bgColor: "bg-yellow-400/15",
    minTrustScore: 65,
    minTotalSales: 20,
    requiresKyc: true,
    maxDisputeRatePct: 15,
    perks: {
      commissionDiscountPct: 1.5,
      maxActiveListings: 50,
      featuredEligible: true,
      payoutSpeedDays: 3,
      searchBoostFactor: 1.1,
      badge: "Gold",
    },
  },
  {
    id: "PLATINUM",
    label: "Platinum",
    color: "text-cyan-400",
    bgColor: "bg-cyan-400/15",
    minTrustScore: 78,
    minTotalSales: 75,
    requiresKyc: true,
    maxDisputeRatePct: 10,
    perks: {
      commissionDiscountPct: 3.0,
      maxActiveListings: 150,
      featuredEligible: true,
      payoutSpeedDays: 2,
      searchBoostFactor: 1.2,
      badge: "Platinum",
    },
  },
  {
    id: "ELITE",
    label: "Elite",
    color: "text-primary",
    bgColor: "bg-primary/15",
    minTrustScore: 90,
    minTotalSales: 200,
    requiresKyc: true,
    maxDisputeRatePct: 5,
    perks: {
      commissionDiscountPct: 5.0,
      maxActiveListings: 500,
      featuredEligible: true,
      payoutSpeedDays: 1,
      searchBoostFactor: 1.35,
      badge: "Elite",
    },
  },
];

// ---------------------------------------------------------------------------
// Pure formula types
// ---------------------------------------------------------------------------

export type TrustSignalInputs = {
  completedOrders: number;
  cancelledOrders: number;
  disputedOrders: number;
  ratingAvg: number;
  ratingCount: number;
  avgFirstReplyMinutes: number | null;
  accountAgeDays: number;
  kycStatus: KycStatus;
};

export type TrustScoreResult = {
  total: number; // 0-100 clamped
  breakdown: {
    completionRate: number;
    ratingScore: number;
    responseTime: number;
    accountAge: number;
    kycVerified: number;
    disputePenalty: number;
  };
};

export type RiskSignalInputs = {
  disputedOrders: number;
  closedOrders: number;
  accountAgeDays: number;
  kycStatus: KycStatus;
  completionRate: number; // 0-1 fraction
};

// ---------------------------------------------------------------------------
// Pure formula functions (no DB calls — testable without a DB)
// ---------------------------------------------------------------------------

export function computeTrustScore(
  signals: TrustSignalInputs,
): TrustScoreResult {
  const closed =
    signals.completedOrders +
    signals.cancelledOrders +
    signals.disputedOrders;
  const completionFrac = closed > 0 ? signals.completedOrders / closed : null;
  const completionRate =
    completionFrac !== null ? Math.round(completionFrac * 30) : 15;

  const ratingScore =
    signals.ratingCount > 0
      ? Math.round((signals.ratingAvg / 5) * 25)
      : 12;

  let responseTime = 10;
  if (signals.avgFirstReplyMinutes !== null) {
    const m = signals.avgFirstReplyMinutes;
    responseTime = m <= 30 ? 20 : m <= 120 ? 15 : m <= 1440 ? 8 : 0;
  }

  const age = signals.accountAgeDays;
  const accountAge = age >= 180 ? 10 : age >= 90 ? 7 : age >= 30 ? 4 : 1;

  const kycVerified =
    signals.kycStatus === "APPROVED"
      ? 10
      : signals.kycStatus === "PENDING"
        ? 3
        : 0;

  const disputeRatePct =
    closed > 0 ? (signals.disputedOrders / closed) * 100 : 0;
  const disputePenalty =
    disputeRatePct > 20 ? -15 : disputeRatePct > 10 ? -8 : 0;

  const total = Math.max(
    0,
    Math.min(
      100,
      completionRate +
        ratingScore +
        responseTime +
        accountAge +
        kycVerified +
        disputePenalty,
    ),
  );

  return {
    total,
    breakdown: {
      completionRate,
      ratingScore,
      responseTime,
      accountAge,
      kycVerified,
      disputePenalty,
    },
  };
}

export function computeRiskScore(signals: RiskSignalInputs): number {
  const disputeRisk =
    signals.closedOrders > 0
      ? (signals.disputedOrders / signals.closedOrders) * 100
      : 0;
  const disputeWeight =
    disputeRisk > 20 ? 40 : disputeRisk > 10 ? 20 : disputeRisk > 5 ? 10 : 0;

  const age = signals.accountAgeDays;
  const ageWeight = age < 7 ? 20 : age < 30 ? 12 : age < 90 ? 5 : 0;

  const kycWeight =
    signals.kycStatus === "NONE" || signals.kycStatus === "REJECTED" ? 20
    : signals.kycStatus === "PENDING" ? 10
    : 0;

  const completionWeight =
    signals.completionRate < 0.5 ? 20 : signals.completionRate < 0.7 ? 10 : 0;

  return Math.max(0, Math.min(100, disputeWeight + ageWeight + kycWeight + completionWeight));
}

export function resolveSellerLevel(
  trustScore: number,
  totalSales: number,
  kycStatus: KycStatus,
  disputeRatePct: number,
): SellerLevelId {
  // Walk from HIGHEST to LOWEST; return the first level the seller qualifies for.
  for (let i = SELLER_LEVELS.length - 1; i >= 0; i--) {
    const lvl = SELLER_LEVELS[i];
    if (trustScore < lvl.minTrustScore) continue;
    if (totalSales < lvl.minTotalSales) continue;
    if (lvl.requiresKyc && kycStatus !== "APPROVED") continue;
    if (
      lvl.maxDisputeRatePct !== null &&
      disputeRatePct > lvl.maxDisputeRatePct
    )
      continue;
    return lvl.id;
  }
  return "BRONZE";
}

// ---------------------------------------------------------------------------
// DB-writing recompute (post-commit side effect — NEVER called inside a tx)
// ---------------------------------------------------------------------------

export async function recomputeSellerTrustAndLevel(
  sellerId: string,
): Promise<void> {
  // 1. Fetch signals from DB
  const profile = await db.sellerProfile.findUnique({
    where: { id: sellerId },
    select: {
      kycStatus: true,
      ratingAvg: true,
      ratingCount: true,
      totalSales: true,
      createdAt: true,
      user: { select: { createdAt: true } },
      ordersAsSeller: {
        where: {
          status: {
            in: ["COMPLETED", "CANCELLED", "DISPUTED", "REFUNDED"],
          },
        },
        select: { status: true },
      },
    },
  });

  if (!profile) return;

  // Average seller first-reply time over the last 20 conversations (minutes).
  // Per conversation: time between conversation creation and the seller's FIRST message in it.
  // NOTE: columns are camelCase (no @map) so they MUST be quoted — "createdAt", not created_at.
  const replyStats = await db.$queryRaw<
    [{ avg_minutes: number | null }]
  >`
    SELECT AVG(EXTRACT(EPOCH FROM (sub.first_reply - sub.conv_created)) / 60) AS avg_minutes
    FROM (
      SELECT c.id,
             c."createdAt" AS conv_created,
             MIN(m."createdAt") AS first_reply
      FROM "Conversation" c
      JOIN "Message" m ON m."conversationId" = c.id
      WHERE c."sellerId" = ${sellerId}
        AND m."senderId" = (SELECT "userId" FROM "SellerProfile" WHERE id = ${sellerId})
      GROUP BY c.id
      ORDER BY conv_created DESC
      LIMIT 20
    ) sub
  `;

  const avgFirstReplyMinutes =
    replyStats[0]?.avg_minutes != null
      ? Number(replyStats[0].avg_minutes)
      : null;

  const closedOrders = profile.ordersAsSeller.length;
  const completedOrders = profile.ordersAsSeller.filter(
    (o) => o.status === "COMPLETED",
  ).length;
  const cancelledOrders = profile.ordersAsSeller.filter(
    (o) => o.status === "CANCELLED",
  ).length;
  const disputedOrders = profile.ordersAsSeller.filter(
    (o) => o.status === "DISPUTED" || o.status === "REFUNDED",
  ).length;

  const accountAgeDays = Math.floor(
    (Date.now() - profile.user.createdAt.getTime()) / 86_400_000,
  );

  const disputeRatePct =
    closedOrders > 0 ? (disputedOrders / closedOrders) * 100 : 0;
  const completionRate = closedOrders > 0 ? completedOrders / closedOrders : 1;

  // 2. Compute pure formula values
  const trustResult = computeTrustScore({
    completedOrders,
    cancelledOrders,
    disputedOrders,
    ratingAvg: profile.ratingAvg,
    ratingCount: profile.ratingCount,
    avgFirstReplyMinutes,
    accountAgeDays,
    kycStatus: profile.kycStatus,
  });

  const riskScore = computeRiskScore({
    disputedOrders,
    closedOrders,
    accountAgeDays,
    kycStatus: profile.kycStatus,
    completionRate,
  });

  const sellerLevel = resolveSellerLevel(
    trustResult.total,
    profile.totalSales,
    profile.kycStatus,
    disputeRatePct,
  );

  const now = new Date();

  // 3. Write ONE update
  await db.sellerProfile.update({
    where: { id: sellerId },
    data: {
      trustScore: trustResult.total,
      trustScoreBreakdown: {
        ...trustResult.breakdown,
        total: trustResult.total,
        computedAt: now.toISOString(),
      },
      trustScoreUpdatedAt: now,
      riskScore,
      riskScoreUpdatedAt: now,
      sellerLevel,
      sellerLevelUpdatedAt: now,
    },
  });

  // 4. Broadcast (fail gracefully)
  try {
    await broadcastTrustUpdate(sellerId, trustResult.total, sellerLevel);
  } catch (err) {
    captureException(err);
  }
}
