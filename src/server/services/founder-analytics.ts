import { unstable_cache } from "next/cache";
import { db } from "@/lib/db";

/**
 * Founder analytics cockpit (Step 19) — SERVER-SIDE ONLY, called from the
 * ADMIN-gated /admin/analytics page. Every KPI is derived from the append-only
 * LedgerEntry (revenue truth) + the Order state machine (GMV / funnel), never
 * from mutable Order.feeMinor (orders can be refunded after the ledger is
 * written). All money is integer minor units. Read-only — zero mutations.
 *
 * Each aggregate has a plain `*Impl` function (the real logic) and an
 * `unstable_cache`-wrapped export (revalidate 300s) so a heavy DB scan runs at
 * most once per 5 minutes regardless of page views. The raw impls are exported
 * via `_analyticsImpl` for the QA harness (unstable_cache can't run outside a
 * Next request context). All BigInt aggregates are converted to Number before
 * returning so the cached value stays JSON-serializable.
 */

// Platform revenue wallet (matches PLATFORM_WALLET_ID in escrow.ts).
const PLATFORM_WALLET = "platform";
const CACHE_TTL = 300;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
function pct(num: number, den: number): number {
  return den > 0 ? round2((num / den) * 100) : 0;
}
/** Midnight (UTC) of `daysAgo` days before today, as a Date. */
function utcDayStart(daysAgo: number): Date {
  const now = new Date();
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return new Date(today - daysAgo * 86_400_000);
}
function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// --- 1a. revenue + GMV trend ------------------------------------------------

export type RevenueDay = {
  date: string; // YYYY-MM-DD
  gmvMinor: number;
  revenueMinor: number;
  orderCount: number;
};

async function trendImpl(days: number): Promise<RevenueDay[]> {
  const start = utcDayStart(days - 1); // inclusive window of exactly `days` days

  const gmvRows = await db.$queryRaw<
    { date: string; gmv: bigint; cnt: bigint }[]
  >`
    SELECT to_char(DATE_TRUNC('day', "updatedAt"), 'YYYY-MM-DD') AS date,
           COALESCE(SUM("totalMinor"), 0)::bigint AS gmv,
           COUNT(*)::bigint AS cnt
    FROM "Order"
    WHERE status = 'COMPLETED' AND "updatedAt" >= ${start}
    GROUP BY 1`;

  const revRows = await db.$queryRaw<{ date: string; rev: bigint }[]>`
    SELECT to_char(DATE_TRUNC('day', "createdAt"), 'YYYY-MM-DD') AS date,
           COALESCE(SUM("amountMinor"), 0)::bigint AS rev
    FROM "LedgerEntry"
    WHERE "walletId" = ${PLATFORM_WALLET} AND reason = 'FEE' AND type = 'CREDIT'
      AND "createdAt" >= ${start}
    GROUP BY 1`;

  const gmvBy = new Map(gmvRows.map((r) => [r.date, r]));
  const revBy = new Map(revRows.map((r) => [r.date, Number(r.rev)]));

  // Gap-fill every calendar day in the window (ascending).
  const out: RevenueDay[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = ymd(utcDayStart(i));
    const g = gmvBy.get(date);
    out.push({
      date,
      gmvMinor: g ? Number(g.gmv) : 0,
      orderCount: g ? Number(g.cnt) : 0,
      revenueMinor: revBy.get(date) ?? 0,
    });
  }
  return out;
}

export const getRevenueAndGmvTrend = unstable_cache(trendImpl, ["fa-trend"], {
  revalidate: CACHE_TTL,
});

// --- 1b. take-rate series (pure transform — no DB) --------------------------

export type TakeRateDay = { date: string; takeRatePercent: number };

export function getTakeRateSeries(trend: RevenueDay[]): TakeRateDay[] {
  return trend.map((d) => ({
    date: d.date,
    takeRatePercent: pct(d.revenueMinor, d.gmvMinor),
  }));
}

// --- 1c. order funnel -------------------------------------------------------

export type OrderFunnel = {
  created: number;
  paid: number;
  completed: number;
  disputed: number;
  refunded: number;
  disputeRate: number;
  refundRate: number;
  completionRate: number;
};

async function funnelImpl(days: number): Promise<OrderFunnel> {
  const start = utcDayStart(days - 1);
  const groups = await db.order.groupBy({
    by: ["status"],
    where: { createdAt: { gte: start } },
    _count: { _all: true },
  });
  const c = (s: string) => groups.find((g) => g.status === s)?._count._all ?? 0;

  const created = groups.reduce((sum, g) => sum + g._count._all, 0);
  const completed = c("COMPLETED");
  const disputed = c("DISPUTED");
  const refunded = c("REFUNDED");
  // Orders that made it past payment (PAID or any later/terminal-paid state).
  const paid = c("PAID") + c("DELIVERED") + completed + disputed + refunded;

  return {
    created,
    paid,
    completed,
    disputed,
    refunded,
    disputeRate: pct(disputed, completed + disputed),
    refundRate: pct(refunded, paid),
    completionRate: pct(completed, created),
  };
}

export const getOrderFunnel = unstable_cache(funnelImpl, ["fa-funnel"], {
  revalidate: CACHE_TTL,
});

// --- 1d. trust health -------------------------------------------------------

export type TrustHealth = {
  avgSellerRating: number;
  kycVerifiedPercent: number;
  openDisputeCount: number;
  resolvedDisputeCount: number;
  sellersWith0Sales: number;
  sellersWithFirstSale: number;
  activeSellersLast30d: number;
};

async function trustImpl(): Promise<TrustHealth> {
  const start30 = utcDayStart(30);
  const [
    ratingAgg,
    totalSellers,
    approvedSellers,
    openDisputes,
    resolvedDisputes,
    with0,
    withSale,
    activeRows,
  ] = await Promise.all([
    db.sellerProfile.aggregate({
      where: { ratingCount: { gt: 0 } },
      _avg: { ratingAvg: true },
    }),
    db.sellerProfile.count(),
    db.sellerProfile.count({ where: { kycStatus: "APPROVED" } }),
    db.dispute.count({ where: { status: "OPEN" } }),
    db.dispute.count({
      where: { status: { in: ["RESOLVED_BUYER", "RESOLVED_SELLER"] } },
    }),
    db.sellerProfile.count({ where: { totalSales: 0 } }),
    db.sellerProfile.count({ where: { totalSales: { gte: 1 } } }),
    db.$queryRaw<{ n: bigint }[]>`
      SELECT COUNT(DISTINCT "sellerId")::bigint AS n
      FROM "Order"
      WHERE status = 'COMPLETED' AND "updatedAt" >= ${start30}`,
  ]);

  return {
    avgSellerRating: round2(ratingAgg._avg.ratingAvg ?? 0),
    kycVerifiedPercent: pct(approvedSellers, totalSellers),
    openDisputeCount: openDisputes,
    resolvedDisputeCount: resolvedDisputes,
    sellersWith0Sales: with0,
    sellersWithFirstSale: withSale,
    activeSellersLast30d: Number(activeRows[0]?.n ?? 0),
  };
}

export const getTrustHealthSnapshot = unstable_cache(trustImpl, ["fa-trust"], {
  revalidate: CACHE_TTL,
});

// --- 1f. top games by revenue -----------------------------------------------

export type GameRevenue = {
  gameId: string;
  gameName: string;
  revenueMinor: number;
  gmvMinor: number;
  orderCount: number;
};

async function topGamesImpl(days: number): Promise<GameRevenue[]> {
  const start = utcDayStart(days - 1);
  const rows = await db.$queryRaw<
    {
      gameId: string;
      gameName: string;
      revenueMinor: bigint;
      gmvMinor: bigint;
      orderCount: bigint;
    }[]
  >`
    SELECT g.id AS "gameId",
           g.name AS "gameName",
           COALESCE(SUM(le."amountMinor"), 0)::bigint AS "revenueMinor",
           COALESCE(SUM(o."totalMinor"), 0)::bigint AS "gmvMinor",
           COUNT(DISTINCT o.id)::bigint AS "orderCount"
    FROM "Game" g
    JOIN "Listing" l ON l."gameId" = g.id
    JOIN "Order" o ON o."listingId" = l.id AND o.status = 'COMPLETED' AND o."updatedAt" >= ${start}
    LEFT JOIN "LedgerEntry" le ON le."orderId" = o.id
      AND le."walletId" = ${PLATFORM_WALLET} AND le.reason = 'FEE' AND le.type = 'CREDIT'
    GROUP BY g.id, g.name
    ORDER BY "revenueMinor" DESC
    LIMIT 5`;

  return rows.map((r) => ({
    gameId: r.gameId,
    gameName: r.gameName,
    revenueMinor: Number(r.revenueMinor),
    gmvMinor: Number(r.gmvMinor),
    orderCount: Number(r.orderCount),
  }));
}

export const getTopGamesByRevenue = unstable_cache(topGamesImpl, ["fa-top-games"], {
  revalidate: CACHE_TTL,
});

// --- 1g. revenue by category kind -------------------------------------------

export type CategoryKindRevenue = {
  kind: string;
  revenueMinor: number;
  gmvMinor: number;
  orderCount: number;
  sharePercent: number;
};

async function byCategoryImpl(days: number): Promise<CategoryKindRevenue[]> {
  const start = utcDayStart(days - 1);
  const rows = await db.$queryRaw<
    { kind: string; revenueMinor: bigint; gmvMinor: bigint; orderCount: bigint }[]
  >`
    SELECT l.type::text AS kind,
           COALESCE(SUM(le."amountMinor"), 0)::bigint AS "revenueMinor",
           COALESCE(SUM(o."totalMinor"), 0)::bigint AS "gmvMinor",
           COUNT(DISTINCT o.id)::bigint AS "orderCount"
    FROM "Listing" l
    JOIN "Order" o ON o."listingId" = l.id AND o.status = 'COMPLETED' AND o."updatedAt" >= ${start}
    LEFT JOIN "LedgerEntry" le ON le."orderId" = o.id
      AND le."walletId" = ${PLATFORM_WALLET} AND le.reason = 'FEE' AND le.type = 'CREDIT'
    GROUP BY l.type
    ORDER BY "revenueMinor" DESC`;

  const mapped = rows.map((r) => ({
    kind: r.kind,
    revenueMinor: Number(r.revenueMinor),
    gmvMinor: Number(r.gmvMinor),
    orderCount: Number(r.orderCount),
  }));
  const totalRev = mapped.reduce((s, r) => s + r.revenueMinor, 0);
  return mapped.map((r) => ({ ...r, sharePercent: pct(r.revenueMinor, totalRev) }));
}

export const getRevenueByCategoryKind = unstable_cache(byCategoryImpl, ["fa-by-category"], {
  revalidate: CACHE_TTL,
});

// --- 1h. new-seller monthly activation cohorts ------------------------------

export type SellerCohortMonth = {
  month: string; // YYYY-MM
  newSellers: number;
  firstSaleInMonth: number;
  activationRate: number;
};

async function cohortsImpl(months: number): Promise<SellerCohortMonth[]> {
  const rows = await db.$queryRaw<
    { month: Date; newSellers: bigint; firstSaleInMonth: bigint }[]
  >`
    SELECT DATE_TRUNC('month', sp."createdAt") AS month,
           COUNT(*)::bigint AS "newSellers",
           COUNT(CASE WHEN first_sale.month = DATE_TRUNC('month', sp."createdAt") THEN 1 END)::bigint AS "firstSaleInMonth"
    FROM "SellerProfile" sp
    LEFT JOIN LATERAL (
      SELECT DATE_TRUNC('month', MIN(o."updatedAt")) AS month
      FROM "Order" o
      WHERE o."sellerId" = sp.id AND o.status = 'COMPLETED'
    ) first_sale ON true
    WHERE sp."createdAt" >= NOW() - make_interval(months => ${months}::int)
    GROUP BY 1
    ORDER BY 1 DESC
    LIMIT ${months}`;

  return rows.map((r) => {
    const newSellers = Number(r.newSellers);
    const firstSaleInMonth = Number(r.firstSaleInMonth);
    return {
      month: new Date(r.month).toISOString().slice(0, 7),
      newSellers,
      firstSaleInMonth,
      activationRate: pct(firstSaleInMonth, newSellers),
    };
  });
}

export const getNewSellerMonthlyActivation = unstable_cache(cohortsImpl, ["fa-cohorts"], {
  revalidate: CACHE_TTL,
});

/** Raw (uncached) impls — for the QA harness only (unstable_cache needs a request scope). */
export const _analyticsImpl = {
  trendImpl,
  funnelImpl,
  trustImpl,
  topGamesImpl,
  byCategoryImpl,
  cohortsImpl,
};
