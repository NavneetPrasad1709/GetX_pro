import type { Prisma, BadgeAwardedBy, UserBadge, Badge } from "@prisma/client";
import { addBreadcrumb } from "@sentry/nextjs";
import { db } from "@/lib/db";

/**
 * Community badges (Step 27). Awards are idempotent via `@@unique([userId, badgeCode])` — a badge is
 * earned at most once and `awardBadge` never throws on a duplicate. Badges are permanent (TOP_SELLER
 * is not revoked when a new month's leaders are crowned).
 */

const EARLY_SELLER_LIMIT = 50;
const VETERAN_SALES = 500;

type Client = Prisma.TransactionClient | typeof db;

/** Grant a badge. Idempotent (upsert with empty update); never throws on a re-award. */
export async function awardBadge(
  userId: string,
  badgeCode: string,
  awardedBy: BadgeAwardedBy,
  client: Client = db,
): Promise<void> {
  const existing = await client.userBadge.findUnique({
    where: { userId_badgeCode: { userId, badgeCode } },
    select: { id: true },
  });
  if (existing) return;
  await client.userBadge.upsert({
    where: { userId_badgeCode: { userId, badgeCode } },
    update: {},
    create: { userId, badgeCode, awardedBy },
  });
  addBreadcrumb({ category: "badge", message: `awarded ${badgeCode} to ${userId}`, level: "info" });
}

/**
 * Milestone badges on order completion — called from escrow.releaseOrder after totalSales bumps.
 * `userId` is the seller's User id; `totalSales` is the seller's new lifetime count.
 * TRUSTED_VETERAN at 500+ sales; EARLY_SELLER if among the first 50 registered sellers.
 */
export async function checkAndAwardMilestoneBadges(
  userId: string,
  totalSales: number,
  client: Client = db,
): Promise<void> {
  if (totalSales >= VETERAN_SALES) {
    await awardBadge(userId, "TRUSTED_VETERAN", "SYSTEM", client);
  }
  const profile = await client.sellerProfile.findUnique({
    where: { userId },
    select: { createdAt: true },
  });
  if (profile) {
    const earlierOrSame = await client.sellerProfile.count({
      where: { createdAt: { lte: profile.createdAt } },
    });
    if (earlierOrSame <= EARLY_SELLER_LIMIT) {
      await awardBadge(userId, "EARLY_SELLER", "SYSTEM", client);
    }
  }
}

/** GUIDE_AUTHOR on first published guide. */
export async function checkAndAwardGuideAuthorBadge(
  userId: string,
  client: Client = db,
): Promise<void> {
  await awardBadge(userId, "GUIDE_AUTHOR", "SYSTEM", client);
}

/**
 * Monthly TOP_SELLER sweep (cron). Top 10 sellers per game by completed orders in the last 30 days.
 * Idempotent (badges are permanent + the unique guard). Returns how many awards were made.
 */
export async function awardTopSellerBadges(): Promise<number> {
  const rows = await db.$queryRaw<{ userId: string; gameId: string; cnt: bigint; rnk: bigint }[]>`
    SELECT "userId", "gameId", cnt, rnk FROM (
      SELECT sp."userId" AS "userId",
             l."gameId"  AS "gameId",
             COUNT(*)    AS cnt,
             ROW_NUMBER() OVER (PARTITION BY l."gameId" ORDER BY COUNT(*) DESC) AS rnk
      FROM "Order" o
      JOIN "Listing" l       ON l.id = o."listingId"
      JOIN "SellerProfile" sp ON sp.id = o."sellerId"
      WHERE o."status" = 'COMPLETED'
        AND o."updatedAt" >= NOW() - INTERVAL '30 days'
      GROUP BY sp."userId", l."gameId"
    ) ranked
    WHERE rnk <= 10
  `;
  let awarded = 0;
  for (const r of rows) {
    await awardBadge(r.userId, "TOP_SELLER", "SYSTEM");
    awarded += 1;
  }
  return awarded;
}

export type UserBadgeWithBadge = UserBadge & { badge: Badge };

/** A user's badges, oldest first (with badge detail for display). */
export async function getUserBadges(userId: string): Promise<UserBadgeWithBadge[]> {
  return db.userBadge.findMany({
    where: { userId },
    orderBy: { awardedAt: "asc" },
    include: { badge: true },
  });
}
