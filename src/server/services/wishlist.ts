import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { listingCardInclude, toListingCardData } from "@/server/services/catalog";
import type { ListingCardData } from "@/components/marketplace/listing-card";

/**
 * Wishlist / favourites (P3-T1). SERVER-SIDE ONLY. A buyer saves listings to
 * come back to; the `@@unique([userId, listingId])` makes toggling idempotent
 * and is the foundation for price-drop / restock alerts (P3-T3). The UI (heart
 * button, wishlist page) is wired by the owner against these functions.
 */

export class WishlistError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WishlistError";
  }
}

/** Toggle a listing in the user's wishlist. Returns the resulting state. */
export async function toggleWishlist(
  userId: string,
  listingId: string,
): Promise<{ wishlisted: boolean }> {
  const existing = await db.wishlist.findUnique({
    where: { userId_listingId: { userId, listingId } },
    select: { id: true },
  });
  if (existing) {
    await db.wishlist.delete({ where: { id: existing.id } });
    return { wishlisted: false };
  }
  try {
    await db.wishlist.create({ data: { userId, listingId } });
    return { wishlisted: true };
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      if (e.code === "P2002") return { wishlisted: true }; // raced — already saved
      if (e.code === "P2003") throw new WishlistError("That listing no longer exists.");
    }
    throw e;
  }
}

export async function isWishlisted(userId: string, listingId: string): Promise<boolean> {
  return (await db.wishlist.count({ where: { userId, listingId } })) > 0;
}

/** Which of these listing ids the user has saved (for hydrating card hearts). */
export async function getWishlistedIds(
  userId: string,
  listingIds: string[],
): Promise<Set<string>> {
  if (listingIds.length === 0) return new Set();
  const rows = await db.wishlist.findMany({
    where: { userId, listingId: { in: listingIds } },
    select: { listingId: true },
  });
  return new Set(rows.map((r) => r.listingId));
}

export async function countWishlist(userId: string): Promise<number> {
  return db.wishlist.count({ where: { userId } });
}

export type WishlistPage = {
  items: ListingCardData[];
  total: number;
  page: number;
  pageCount: number;
};

/** Paginated wishlist for the dashboard page (sold/removed listings shown as-is). */
export async function getWishlist(
  userId: string,
  page = 1,
  pageSize = 24,
): Promise<WishlistPage> {
  const [rows, total] = await Promise.all([
    db.wishlist.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      skip: (Math.max(1, page) - 1) * pageSize,
      take: pageSize,
      include: { listing: { include: listingCardInclude } },
    }),
    db.wishlist.count({ where: { userId } }),
  ]);
  return {
    items: rows.map((r) => toListingCardData(r.listing)),
    total,
    page: Math.max(1, page),
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
  };
}
