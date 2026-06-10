import { Prisma, type CategoryKind } from "@prisma/client";
import { db } from "@/lib/db";

/**
 * Marketplace liquidity service (Prompt 12) — cold-start metrics, demand
 * capture, and activity tracking. SERVER-SIDE ONLY.
 *
 * The new-seller visibility boost itself lives in marketplace.ts (it's a raw
 * SQL ORDER BY on the `newest` sort) — this file owns the supporting writes:
 * demand capture, activity bumps, view counts, and the admin liquidity report.
 */

export class LiquidityServiceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LiquidityServiceError";
  }
}

// ---------------------------------------------------------------------------
// Admin liquidity dashboard
// ---------------------------------------------------------------------------

export type LiquidityStat = {
  gameSlug: string;
  gameName: string;
  categorySlug: string;
  categoryName: string;
  kind: CategoryKind;
  activeListings: number;
  totalSellers: number;
  demandSignals: number;
  staleListings: number; // ACTIVE, lastActivityAt < now() - 30d
  deadListings: number; // ACTIVE, stock = 0
  fillRate: number; // activeListings / (activeListings + demandSignals), 0..1
};

type LiquidityRow = {
  gameSlug: string;
  gameName: string;
  categorySlug: string;
  categoryName: string;
  kind: CategoryKind;
  activeListings: bigint;
  totalSellers: bigint;
  demandSignals: bigint;
  staleListings: bigint;
  deadListings: bigint;
};

/**
 * One pass over every category with its supply + demand depth. A single
 * $queryRaw (not N queries across 17 categories) — joins Category→Game and
 * LEFT JOINs Listing + DemandSignal, aggregating with FILTER clauses.
 */
export async function getLiquidityStats(): Promise<LiquidityStat[]> {
  const rows = await db.$queryRaw<LiquidityRow[]>`
    SELECT
      g.slug AS "gameSlug",
      g.name AS "gameName",
      c.slug AS "categorySlug",
      c.name AS "categoryName",
      c.kind AS "kind",
      COUNT(DISTINCT l.id) FILTER (WHERE l.status = 'ACTIVE') AS "activeListings",
      COUNT(DISTINCT l."sellerId") FILTER (WHERE l.status = 'ACTIVE') AS "totalSellers",
      COUNT(DISTINCT ds.id) AS "demandSignals",
      COUNT(DISTINCT l.id) FILTER (
        WHERE l.status = 'ACTIVE' AND l."lastActivityAt" < NOW() - INTERVAL '30 days'
      ) AS "staleListings",
      COUNT(DISTINCT l.id) FILTER (
        WHERE l.status = 'ACTIVE' AND l.stock = 0
      ) AS "deadListings"
    FROM "Category" c
    JOIN "Game" g ON g.id = c."gameId"
    LEFT JOIN "Listing" l ON l."categoryId" = c.id
    LEFT JOIN "DemandSignal" ds ON ds."categoryId" = c.id
    WHERE g."isActive" = true
    GROUP BY g.slug, g.name, c.slug, c.name, c.kind, g."sortOrder", c."sortOrder"
    ORDER BY g."sortOrder" ASC, c."sortOrder" ASC
  `;

  return rows.map((r) => {
    const activeListings = Number(r.activeListings);
    const demandSignals = Number(r.demandSignals);
    const denom = activeListings + demandSignals;
    return {
      gameSlug: r.gameSlug,
      gameName: r.gameName,
      categorySlug: r.categorySlug,
      categoryName: r.categoryName,
      kind: r.kind,
      activeListings,
      totalSellers: Number(r.totalSellers),
      demandSignals,
      staleListings: Number(r.staleListings),
      deadListings: Number(r.deadListings),
      fillRate: denom === 0 ? 0 : Math.min(1, activeListings / denom),
    };
  });
}

// ---------------------------------------------------------------------------
// Demand capture (anonymous "notify me" for empty categories)
// ---------------------------------------------------------------------------

/**
 * Idempotently record a buyer's interest in an (as-yet-empty) category.
 * Validates the game + category exist and are active BEFORE inserting — a
 * crafted request can never create a phantom DemandSignal. The unique
 * [email, categoryId] makes a repeat submission a no-op.
 *
 * Rate-limiting by IP happens in the server action wrapper (anonymous, no userId).
 */
export async function captureWishlistDemand(
  email: string,
  categoryId: string,
  gameId: string,
): Promise<void> {
  const category = await db.category.findFirst({
    where: { id: categoryId, gameId, game: { isActive: true } },
    select: { id: true },
  });
  if (!category) {
    throw new LiquidityServiceError("That category no longer exists.");
  }

  // Idempotent: ON CONFLICT (email, categoryId) DO NOTHING semantics via upsert.
  await db.demandSignal.upsert({
    where: { email_categoryId: { email, categoryId } },
    update: {}, // already on the list — no-op
    create: { email, categoryId, gameId },
  });
}

// ---------------------------------------------------------------------------
// Activity tracking
// ---------------------------------------------------------------------------

/**
 * Bump a listing's freshness clock. Called when a seller edits the price,
 * re-activates, or restocks — this resets the 60-day stale-pause countdown.
 */
export async function bumpListingActivity(listingId: string): Promise<void> {
  await db.listing.update({
    where: { id: listingId },
    data: { lastActivityAt: new Date() },
  });
}

/**
 * Fire-and-forget detail-page view counter. NEVER throws — a failed increment
 * must not break the buyer's page render. Call as `void recordListingView(id)`.
 */
export async function recordListingView(listingId: string): Promise<void> {
  try {
    await db.listing.update({
      where: { id: listingId },
      data: { viewCount: { increment: 1 } },
    });
  } catch {
    // view counts are non-critical telemetry — swallow.
  }
}

// ---------------------------------------------------------------------------
// New-seller boost SQL fragment (consumed by marketplace.ts)
// ---------------------------------------------------------------------------

/**
 * The CASE expression that ranks an in-window new-seller listing above the
 * rest on the `newest` sort. Exported as a Prisma.Sql fragment so the boost
 * threshold lives in ONE place. `maxSales` = siteConfig.NEW_SELLER_BOOST_MAX_SALES.
 */
export function newSellerBoostOrderSql(maxSales: number): Prisma.Sql {
  return Prisma.sql`CASE WHEN l."newSellerBoostUntil" > NOW() AND sp."totalSales" < ${maxSales} THEN 1 ELSE 0 END`;
}
