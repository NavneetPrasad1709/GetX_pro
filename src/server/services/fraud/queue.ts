import { db } from "@/lib/db";
import type {
  FraudFlag,
  FraudSeverity,
  FraudTargetType,
  FraudAutoAction,
} from "@prisma/client";

/**
 * Admin fraud-queue reads (Prompt 16). SERVER-SIDE ONLY; callers are ADMIN-gated.
 */

export type FraudQueueRow = {
  id: string;
  targetType: FraudTargetType;
  targetId: string;
  reason: string;
  severity: FraudSeverity;
  autoAction: FraudAutoAction;
  riskScore: number;
  createdAt: string;
};

/** OPEN flags, CRITICAL→HIGH→… first, then oldest. Page size capped. */
export async function listOpenFraudFlags(limit = 50): Promise<FraudQueueRow[]> {
  const rows: FraudFlag[] = await db.fraudFlag.findMany({
    where: { status: "OPEN" },
    orderBy: [{ severity: "desc" }, { createdAt: "asc" }],
    take: Math.min(Math.max(1, limit), 100),
  });
  return rows.map((r) => ({
    id: r.id,
    targetType: r.targetType,
    targetId: r.targetId,
    reason: r.reason,
    severity: r.severity,
    autoAction: r.autoAction,
    riskScore: r.riskScore,
    createdAt: r.createdAt.toISOString(),
  }));
}

export type FraudQueueCounts = Record<FraudSeverity, number>;

/** OPEN counts per severity for the header chips. */
export async function fraudQueueCounts(): Promise<FraudQueueCounts> {
  const groups = await db.fraudFlag.groupBy({
    by: ["severity"],
    where: { status: "OPEN" },
    _count: { _all: true },
  });
  const counts: FraudQueueCounts = { LOW: 0, MEDIUM: 0, HIGH: 0, CRITICAL: 0 };
  for (const g of groups) counts[g.severity] = g._count._all;
  return counts;
}
