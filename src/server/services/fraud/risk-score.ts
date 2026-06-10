import { db } from "@/lib/db";

/**
 * Composite fraud risk score (Prompt 16). Computed ON DEMAND from active
 * FraudFlag rows — never stored. Step 17's Trust Score subtracts this from the
 * base. SERVER-SIDE ONLY.
 *
 * Weighting (clamped 0-100): any active CRITICAL → 100; else
 *   HIGH +25 (cap 75) · MEDIUM +10 (cap 50) · LOW +3 (cap 30).
 * "Active" = status OPEN or REVIEWING (DISMISSED/ACTIONED excluded).
 */

const ACTIVE_STATUSES = ["OPEN", "REVIEWING"] as const;

function scoreFromCounts(counts: {
  CRITICAL: number;
  HIGH: number;
  MEDIUM: number;
  LOW: number;
}): number {
  if (counts.CRITICAL > 0) return 100;
  const high = Math.min(counts.HIGH * 25, 75);
  const medium = Math.min(counts.MEDIUM * 10, 50);
  const low = Math.min(counts.LOW * 3, 30);
  return Math.max(0, Math.min(100, high + medium + low));
}

async function severityCountsForTarget(targetId: string) {
  const groups = await db.fraudFlag.groupBy({
    by: ["severity"],
    where: { targetId, status: { in: [...ACTIVE_STATUSES] } },
    _count: { _all: true },
  });
  const counts = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };
  for (const g of groups) counts[g.severity] = g._count._all;
  return counts;
}

/** 0-100 composite risk for a User (flags whose targetId = userId). */
export async function computeUserRiskScore(userId: string): Promise<number> {
  return scoreFromCounts(await severityCountsForTarget(userId));
}

/**
 * Seller risk + human-readable signals for the admin view. Seller-level flags
 * are keyed by the seller's User id; payout-hold + refund/dispute rates are
 * surfaced as extra signals.
 */
export async function computeSellerRiskScore(
  sellerId: string,
): Promise<{ riskScore: number; signals: string[] }> {
  const profile = await db.sellerProfile.findUnique({
    where: { id: sellerId },
    select: { userId: true, payoutHeldAt: true },
  });
  if (!profile) return { riskScore: 0, signals: [] };

  const [counts, flags] = await Promise.all([
    severityCountsForTarget(profile.userId),
    db.fraudFlag.findMany({
      where: { targetId: profile.userId, status: { in: [...ACTIVE_STATUSES] } },
      select: { reason: true, severity: true },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
  ]);

  const signals = flags.map((f) => `${f.severity}: ${f.reason}`);
  if (profile.payoutHeldAt) signals.unshift("payout_held");

  return { riskScore: scoreFromCounts(counts), signals };
}
