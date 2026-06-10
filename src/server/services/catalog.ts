import { cache } from "react";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import type { ListingCardData } from "@/components/marketplace/listing-card";

/**
 * Catalog read layer (Step 05): games → categories → listings.
 * SERVER-SIDE ONLY — pages/components never touch Prisma directly.
 *
 * Query functions are wrapped in React `cache()` so `generateMetadata` and the
 * page body share ONE query per request instead of hitting Neon twice.
 * Only ACTIVE games/listings are ever exposed publicly.
 */

// Slugs come from URLs (untrusted) — validate shape before querying.
const slugSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9-]+$/);

const ACTIVE_LISTING = { status: "ACTIVE" as const };

/** How many listings a category page shows per page (Step 07 reuses this). */
export const CATEGORY_PAGE_SIZE = 24;

// ---------------------------------------------------------------------------
// Listing → ListingCardData mapper (single place where DB rows become UI data)
// ---------------------------------------------------------------------------

export const listingCardInclude = {
  seller: {
    select: {
      id: true,
      displayName: true,
      trustScore: true,
      ratingAvg: true,
      ratingCount: true,
      kycStatus: true,
      sellerLevel: true,
      subscriptionTier: true,
      user: { select: { image: true } },
    },
  },
  game: { select: { name: true } },
} satisfies Prisma.ListingInclude;

type ListingForCard = Prisma.ListingGetPayload<{
  include: typeof listingCardInclude;
}>;

export function toListingCardData(listing: ListingForCard): ListingCardData {
  return {
    id: listing.id,
    slug: listing.slug,
    title: listing.title,
    image: listing.images[0] ?? null,
    priceMinor: listing.priceMinor,
    currency: listing.currency,
    game: listing.game.name,
    type: listing.type,
    deliveryType: listing.deliveryType,
    // Listing-level reviews arrive in Step 13 — until then the seller's
    // aggregate rating is the honest signal we have.
    rating: listing.seller.ratingCount > 0 ? listing.seller.ratingAvg : null,
    reviews: listing.seller.ratingCount > 0 ? listing.seller.ratingCount : null,
    seller: {
      id: listing.seller.id,
      name: listing.seller.displayName,
      image: listing.seller.user.image,
      trustScore: listing.seller.trustScore,
      kycVerified: listing.seller.kycStatus === "APPROVED",
      sellerLevel: listing.seller.sellerLevel,
      proMember: listing.seller.subscriptionTier === "PRO",
    },
  };
}

// ---------------------------------------------------------------------------
// Games index
// ---------------------------------------------------------------------------

export type GameSummary = {
  id: string;
  name: string;
  slug: string;
  iconUrl: string | null;
  bannerUrl: string | null;
  listingCount: number;
};

/** All active games (launch order) with their ACTIVE listing counts. */
export const getActiveGames = cache(async (): Promise<GameSummary[]> => {
  const games = await db.game.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: "asc" },
    select: {
      id: true,
      name: true,
      slug: true,
      iconUrl: true,
      bannerUrl: true,
      _count: { select: { listings: { where: ACTIVE_LISTING } } },
    },
  });

  return games.map(({ _count, ...game }) => ({
    ...game,
    listingCount: _count.listings,
  }));
});

// ---------------------------------------------------------------------------
// Game landing page
// ---------------------------------------------------------------------------

export type CategorySummary = {
  id: string;
  name: string;
  slug: string;
  kind: "ACCOUNT" | "ITEM" | "CURRENCY" | "BOOSTING";
  listingCount: number;
};

export type GameDetail = GameSummary & { categories: CategorySummary[] };

/** One active game + its categories (each with an ACTIVE listing count). */
export const getGameBySlug = cache(
  async (slug: string): Promise<GameDetail | null> => {
    const parsed = slugSchema.safeParse(slug);
    if (!parsed.success) return null;

    const game = await db.game.findFirst({
      where: { slug: parsed.data, isActive: true },
      select: {
        id: true,
        name: true,
        slug: true,
        iconUrl: true,
        bannerUrl: true,
        _count: { select: { listings: { where: ACTIVE_LISTING } } },
        categories: {
          orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
          select: {
            id: true,
            name: true,
            slug: true,
            kind: true,
            _count: { select: { listings: { where: ACTIVE_LISTING } } },
          },
        },
      },
    });
    if (!game) return null;

    const { _count, categories, ...rest } = game;
    return {
      ...rest,
      listingCount: _count.listings,
      categories: categories.map(({ _count: c, ...cat }) => ({
        ...cat,
        listingCount: c.listings,
      })),
    };
  },
);

/**
 * Latest ACTIVE listings per category (game landing previews).
 * Issues ONE batched query (categoryId IN [...]) instead of N parallel queries.
 * Categories with zero listings produce empty arrays — no wasted rows.
 */
export async function getCategoryPreviews(
  categories: CategorySummary[],
  perCategory = 4,
): Promise<Map<string, ListingCardData[]>> {
  const stocked = categories.filter((c) => c.listingCount > 0);
  if (stocked.length === 0) return new Map();

  const categoryIds = stocked.map((c) => c.id);

  // One round-trip: fetch up to perCategory * stocked.length rows ordered by
  // (categoryId, createdAt DESC), then group in memory.
  // Postgres window functions would be ideal but Prisma does not expose them.
  const rows = await db.listing.findMany({
    where: { categoryId: { in: categoryIds }, ...ACTIVE_LISTING },
    orderBy: [{ categoryId: "asc" }, { createdAt: "desc" }],
    take: perCategory * stocked.length,
    include: listingCardInclude,
  });

  const grouped = new Map<string, ListingCardData[]>();
  for (const row of rows) {
    const existing = grouped.get(row.categoryId) ?? [];
    if (existing.length < perCategory) {
      existing.push(toListingCardData(row));
      grouped.set(row.categoryId, existing);
    }
  }

  return grouped;
}

// ---------------------------------------------------------------------------
// Category page (paginated)
// ---------------------------------------------------------------------------

export type CategoryListingsPage = {
  items: ListingCardData[];
  total: number;
  pageCount: number;
};

/**
 * One page of a category's ACTIVE listings, newest first.
 * cache()-wrapped: generateMetadata (404 for out-of-range pages) and the page
 * body share one query per request.
 */
export const getCategoryListingsPage = cache(
  async (categoryId: string, page: number): Promise<CategoryListingsPage> => {
    const where = { categoryId, ...ACTIVE_LISTING };

    const [rows, total] = await db.$transaction([
      db.listing.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * CATEGORY_PAGE_SIZE,
        take: CATEGORY_PAGE_SIZE,
        include: listingCardInclude,
      }),
      db.listing.count({ where }),
    ]);

    return {
      items: rows.map(toListingCardData),
      total,
      pageCount: Math.max(1, Math.ceil(total / CATEGORY_PAGE_SIZE)),
    };
  },
);

// ---------------------------------------------------------------------------
// Listing form (Step 06) — id-keyed game→category tree for selects
// ---------------------------------------------------------------------------

export type FormCategory = {
  id: string;
  name: string;
  kind: "ACCOUNT" | "ITEM" | "CURRENCY" | "BOOSTING";
};
export type FormGame = { id: string; name: string; categories: FormCategory[] };

/** Active games + categories with IDs — feeds the create/edit listing form. */
export const getCatalogForForm = cache(async (): Promise<FormGame[]> => {
  return db.game.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: "asc" },
    select: {
      id: true,
      name: true,
      categories: {
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        select: { id: true, name: true, kind: true },
      },
    },
  });
});

// ---------------------------------------------------------------------------
// Sitemap
// ---------------------------------------------------------------------------

export type CatalogTreeGame = {
  slug: string;
  createdAt: Date;
  categories: { slug: string }[];
};

/** Slim game→category slug tree for sitemap generation. */
export const getCatalogTree = cache(async (): Promise<CatalogTreeGame[]> => {
  return db.game.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: "asc" },
    select: {
      slug: true,
      createdAt: true,
      categories: {
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        select: { slug: true },
      },
    },
  });
});
