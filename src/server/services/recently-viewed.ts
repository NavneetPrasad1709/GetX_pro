import { db } from "@/lib/db";
import { listingCardInclude, toListingCardData } from "@/server/services/catalog";
import type { ListingCardData } from "@/components/marketplace/listing-card";

/**
 * Recently-viewed listings (P3-T2). SERVER-SIDE ONLY, logged-in users only
 * (anon recently-viewed is a client/cookie concern the owner can add). Recorded
 * via a server action from a tiny client tracker on the listing page — NOT from
 * the ISR page body, which runs at most once per 60s per slug. Capped per user.
 */

const CAP = 20;

/** Record a view (dedupe by listing, bump viewedAt, trim to the most-recent CAP). */
export async function recordRecentlyViewed(
  userId: string,
  listingId: string,
): Promise<void> {
  await db.recentlyViewed.upsert({
    where: { userId_listingId: { userId, listingId } },
    create: { userId, listingId },
    update: { viewedAt: new Date() },
  });
  const overflow = await db.recentlyViewed.findMany({
    where: { userId },
    orderBy: { viewedAt: "desc" },
    skip: CAP,
    select: { id: true },
  });
  if (overflow.length > 0) {
    await db.recentlyViewed.deleteMany({
      where: { id: { in: overflow.map((r) => r.id) } },
    });
  }
}

/** Recently-viewed rail data — ACTIVE listings only, newest first. */
export async function getRecentlyViewed(
  userId: string,
  limit = 12,
  excludeListingId?: string,
): Promise<ListingCardData[]> {
  const rows = await db.recentlyViewed.findMany({
    where: {
      userId,
      listing: { status: "ACTIVE" },
      ...(excludeListingId ? { listingId: { not: excludeListingId } } : {}),
    },
    orderBy: { viewedAt: "desc" },
    take: limit,
    include: { listing: { include: listingCardInclude } },
  });
  return rows.map((r) => toListingCardData(r.listing));
}
