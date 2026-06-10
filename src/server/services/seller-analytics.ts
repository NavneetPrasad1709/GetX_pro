import { cache } from "react";
import type { OrderStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { getWalletBalances } from "@/server/services/wallet";

/**
 * Seller "CEO" dashboard analytics (Step 20). Read-only, server-side, integer minor units
 * throughout — only the render layer converts to display currency.
 *
 * RECONCILED to the real money model (the step prompt assumed a `userId`+`kind` ledger; ours
 * is wallet-based): a seller's revenue = CREDIT/SALE rows on their Wallet (sellerProfileId =
 * sellerId), already NET of commission. Commission paid = the `order.sellerFeeMinor` snapshot.
 * The platform FEE rows live on the PLATFORM wallet, not the seller's.
 *
 * Every function is wrapped in React.cache() so repeated RSC reads in one request dedupe.
 * No N+1: each function is a single grouped/aggregated round-trip.
 */

const DAY_MS = 86_400_000;

/** UTC midnight `days-1` ago — start of the inclusive window. */
function windowStart(days: number): Date {
  const todayUtc = Math.floor(Date.now() / DAY_MS) * DAY_MS;
  return new Date(todayUtc - (days - 1) * DAY_MS);
}

/** YYYY-MM-DD in UTC (matches Postgres DATE() under a UTC server). */
function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** A seller's wallet id, or null if they have never transacted (no wallet yet). */
async function sellerWalletId(sellerId: string): Promise<string | null> {
  const w = await db.wallet.findUnique({
    where: { sellerProfileId: sellerId },
    select: { id: true },
  });
  return w?.id ?? null;
}

export type RevenuePoint = { date: string; revenue: number; orders: number };

/**
 * Daily SALE revenue for the last `days` days, gap-filled with zeros so the chart is
 * continuous. `revenue` is minor units; `orders` = completed sales that day (1 SALE row each).
 */
export const getRevenueSeries = cache(
  async (sellerId: string, days = 30): Promise<RevenuePoint[]> => {
    const start = windowStart(days);
    const skeleton: RevenuePoint[] = Array.from({ length: days }, (_, i) => ({
      date: dayKey(new Date(start.getTime() + i * DAY_MS)),
      revenue: 0,
      orders: 0,
    }));

    const walletId = await sellerWalletId(sellerId);
    if (!walletId) return skeleton;

    const rows = await db.$queryRaw<
      { day: Date; revenue: bigint | null; orders: bigint }[]
    >`
      SELECT DATE("createdAt") AS day,
             SUM("amountMinor") AS revenue,
             COUNT(*) AS orders
      FROM "LedgerEntry"
      WHERE "walletId" = ${walletId}
        AND "reason" = 'SALE'
        AND "type" = 'CREDIT'
        AND "createdAt" >= ${start}
      GROUP BY DATE("createdAt")
    `;

    const byDay = new Map<string, { revenue: number; orders: number }>();
    for (const r of rows) {
      byDay.set(dayKey(new Date(r.day)), {
        revenue: Number(r.revenue ?? 0),
        orders: Number(r.orders),
      });
    }
    return skeleton.map((p) => {
      const hit = byDay.get(p.date);
      return hit ? { ...p, revenue: hit.revenue, orders: hit.orders } : p;
    });
  },
);

export type TopListing = {
  listingId: string;
  title: string;
  slug: string;
  completedCount: number;
  revenue: number;
};

/** Top 5 listings by completed-sale count (revenue is the tiebreak + shown). */
export const getTopListings = cache(
  async (sellerId: string, days = 30): Promise<TopListing[]> => {
    const start = windowStart(days);
    const rows = await db.$queryRaw<
      {
        listingId: string;
        title: string;
        slug: string;
        completed: bigint;
        revenue: bigint | null;
      }[]
    >`
      SELECT o."listingId"              AS "listingId",
             l."title"                  AS title,
             l."slug"                   AS slug,
             COUNT(DISTINCT o.id)       AS completed,
             COALESCE(SUM(le."amountMinor"), 0) AS revenue
      FROM "Order" o
      JOIN "Listing" l ON l.id = o."listingId"
      LEFT JOIN "LedgerEntry" le
        ON le."orderId" = o.id AND le."reason" = 'SALE' AND le."type" = 'CREDIT'
      WHERE o."sellerId" = ${sellerId}
        AND o."status" = 'COMPLETED'
        AND o."createdAt" >= ${start}
      GROUP BY o."listingId", l."title", l."slug"
      ORDER BY completed DESC, revenue DESC
      LIMIT 5
    `;
    return rows.map((r) => ({
      listingId: r.listingId,
      title: r.title,
      slug: r.slug,
      completedCount: Number(r.completed),
      revenue: Number(r.revenue ?? 0),
    }));
  },
);

export type FunnelStage = { status: OrderStatus; count: number };

// The buyer-visible order lifecycle, in flow order (zero-filled so the chart is stable).
const FUNNEL_STATUSES: OrderStatus[] = [
  "AWAITING_PAYMENT",
  "PAID",
  "DELIVERED",
  "COMPLETED",
  "DISPUTED",
  "REFUNDED",
  "CANCELLED",
];

/** Order count per status in the window (all stages returned, zero if none). */
export const getOrderFunnel = cache(
  async (sellerId: string, days = 30): Promise<FunnelStage[]> => {
    const start = windowStart(days);
    const grouped = await db.order.groupBy({
      by: ["status"],
      where: { sellerId, createdAt: { gte: start } },
      _count: { _all: true },
    });
    const counts = new Map<string, number>();
    for (const g of grouped) counts.set(g.status, g._count._all);
    return FUNNEL_STATUSES.map((status) => ({ status, count: counts.get(status) ?? 0 }));
  },
);

export type WalletSummary = {
  availableMinor: number;
  heldMinor: number;
  totalEarnedMinor: number;
  totalFeesMinor: number;
};

/** Wallet snapshot for the stat cards. `totalFees` = commission the seller has paid (snapshots). */
export const getWalletSummary = cache(
  async (sellerId: string): Promise<WalletSummary> => {
    const walletId = await sellerWalletId(sellerId);

    const [balances, earned, fees] = await Promise.all([
      walletId
        ? getWalletBalances(walletId)
        : Promise.resolve({ availableMinor: 0, heldMinor: 0, grossMinor: 0 }),
      walletId
        ? db.ledgerEntry.aggregate({
            where: { walletId, reason: "SALE", type: "CREDIT" },
            _sum: { amountMinor: true },
          })
        : Promise.resolve({ _sum: { amountMinor: 0 } }),
      db.order.aggregate({
        where: { sellerId, status: "COMPLETED" },
        _sum: { sellerFeeMinor: true },
      }),
    ]);

    return {
      availableMinor: balances.availableMinor,
      heldMinor: balances.heldMinor,
      totalEarnedMinor: earned._sum.amountMinor ?? 0,
      totalFeesMinor: fees._sum.sellerFeeMinor ?? 0,
    };
  },
);

/** Total orders in the window (for the 4th stat card). */
export const getOrderCount = cache(
  async (sellerId: string, days = 30): Promise<number> => {
    const start = windowStart(days);
    return db.order.count({ where: { sellerId, createdAt: { gte: start } } });
  },
);

export type PriceBenchmark = {
  avgMinor: number;
  minMinor: number;
  maxMinor: number;
  sampleSize: number;
};

/**
 * Peer price stats for a listing's game+category (ACTIVE peers, excluding itself).
 * Returns null when there are no peers to compare against.
 */
export const getPriceBenchmark = cache(
  async (listingId: string): Promise<PriceBenchmark | null> => {
    const listing = await db.listing.findUnique({
      where: { id: listingId },
      select: { gameId: true, categoryId: true },
    });
    if (!listing) return null;

    const agg = await db.listing.aggregate({
      where: {
        gameId: listing.gameId,
        categoryId: listing.categoryId,
        status: "ACTIVE",
        id: { not: listingId },
      },
      _avg: { priceMinor: true },
      _min: { priceMinor: true },
      _max: { priceMinor: true },
      _count: { _all: true },
    });

    if (agg._count._all === 0 || agg._avg.priceMinor == null) return null;
    return {
      avgMinor: Math.round(agg._avg.priceMinor),
      minMinor: agg._min.priceMinor ?? 0,
      maxMinor: agg._max.priceMinor ?? 0,
      sampleSize: agg._count._all,
    };
  },
);
