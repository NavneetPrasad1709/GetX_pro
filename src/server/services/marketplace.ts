import { cache } from "react";
import { Prisma, type CategoryKind, type DeliveryType } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  listingCardInclude,
  toListingCardData,
} from "@/server/services/catalog";
import type { ListingCardData } from "@/components/marketplace/listing-card";
import {
  MARKETPLACE_PAGE_SIZE,
  type MarketplaceFilters,
  type SortKey,
} from "@/lib/validators/marketplace";

/**
 * Marketplace read layer (Step 07): cross-game browse/search/filter/sort +
 * the listing detail page. SERVER-SIDE ONLY — pages never touch Prisma.
 *
 * Only ACTIVE listings are ever exposed. One `include` pulls seller + game in
 * the same query (no N+1). Search is Postgres ILIKE (`contains` insensitive) on
 * title + description — fine for the launch catalog; a trigram/Algolia upgrade
 * is Step 28 ("Postgres search now; Algolia later").
 */

const ACTIVE = "ACTIVE" as const;

// ---------------------------------------------------------------------------
// Browse: search + filter + sort + paginate
// ---------------------------------------------------------------------------

function buildWhere(f: MarketplaceFilters): Prisma.ListingWhereInput {
  const where: Prisma.ListingWhereInput = { status: ACTIVE };

  if (f.q) {
    where.OR = [
      { title: { contains: f.q, mode: "insensitive" } },
      { description: { contains: f.q, mode: "insensitive" } },
    ];
  }
  if (f.game) where.game = { slug: f.game, isActive: true };
  if (f.type) where.type = f.type as CategoryKind;
  if (f.delivery) where.deliveryType = f.delivery as DeliveryType;
  if (f.currency) where.currency = f.currency;

  if (f.minPriceMinor !== undefined || f.maxPriceMinor !== undefined) {
    where.priceMinor = {
      ...(f.minPriceMinor !== undefined ? { gte: f.minPriceMinor } : {}),
      ...(f.maxPriceMinor !== undefined ? { lte: f.maxPriceMinor } : {}),
    };
  }

  // Seller trust/rating filter on the to-one relation (SellerProfile.trustScore
  // is indexed). Both fold into one nested filter.
  if (f.trust !== undefined || f.rating !== undefined) {
    where.seller = {
      ...(f.trust !== undefined ? { trustScore: { gte: f.trust } } : {}),
      ...(f.rating !== undefined ? { ratingAvg: { gte: f.rating } } : {}),
    };
  }

  return where;
}

/**
 * orderBy per sort key. A stable `id` tiebreaker is always last so pages never
 * drop/duplicate rows when the primary sort key ties (offset pagination needs a
 * total order). "newest" is backed by the @@index([status, createdAt]) added in
 * Step 07.
 */
function buildOrderBy(
  sort: SortKey,
): Prisma.ListingOrderByWithRelationInput[] {
  switch (sort) {
    case "price_asc":
      return [{ priceMinor: "asc" }, { id: "desc" }];
    case "price_desc":
      return [{ priceMinor: "desc" }, { id: "desc" }];
    case "rating":
      return [
        { seller: { ratingAvg: "desc" } },
        { createdAt: "desc" },
        { id: "desc" },
      ];
    case "trust":
      return [
        { seller: { trustScore: "desc" } },
        { createdAt: "desc" },
        { id: "desc" },
      ];
    case "newest":
    default:
      return [{ createdAt: "desc" }, { id: "desc" }];
  }
}

export type MarketplaceResultPage = {
  items: ListingCardData[];
  total: number;
  page: number;
  pageCount: number;
  pageSize: number;
};

/** One page of marketplace results for the given filters. */
export async function searchListings(
  f: MarketplaceFilters,
): Promise<MarketplaceResultPage> {
  const where = buildWhere(f);

  const [rows, total] = await db.$transaction([
    db.listing.findMany({
      where,
      orderBy: buildOrderBy(f.sort),
      skip: (f.page - 1) * MARKETPLACE_PAGE_SIZE,
      take: MARKETPLACE_PAGE_SIZE,
      include: listingCardInclude,
    }),
    db.listing.count({ where }),
  ]);

  return {
    items: rows.map(toListingCardData),
    total,
    page: f.page,
    pageCount: Math.max(1, Math.ceil(total / MARKETPLACE_PAGE_SIZE)),
    pageSize: MARKETPLACE_PAGE_SIZE,
  };
}

// ---------------------------------------------------------------------------
// Listing detail
// ---------------------------------------------------------------------------

// Slugs come from the URL (untrusted) — validate shape before querying.
const slugSchema = z
  .string()
  .min(1)
  .max(120)
  .regex(/^[a-z0-9-]+$/);

const listingDetailInclude = {
  seller: {
    select: {
      id: true,
      displayName: true,
      bio: true,
      country: true,
      trustScore: true,
      ratingAvg: true,
      ratingCount: true,
      totalSales: true,
      kycStatus: true,
      createdAt: true,
      user: { select: { name: true, image: true } },
    },
  },
  game: { select: { name: true, slug: true } },
  category: { select: { name: true, slug: true } },
} satisfies Prisma.ListingInclude;

type ListingDetailRow = Prisma.ListingGetPayload<{
  include: typeof listingDetailInclude;
}>;

export type ListingDetail = {
  id: string;
  slug: string;
  title: string;
  description: string;
  images: string[];
  priceMinor: number;
  currency: string;
  stock: number;
  type: CategoryKind;
  deliveryType: DeliveryType;
  attributes: Record<string, string | number>;
  createdAt: Date;
  game: { name: string; slug: string };
  category: { name: string; slug: string };
  seller: {
    id: string;
    displayName: string;
    bio: string | null;
    country: string | null;
    image: string | null;
    trustScore: number;
    ratingAvg: number;
    ratingCount: number;
    totalSales: number;
    kycVerified: boolean;
    memberSince: Date;
  };
};

/** Coerce the Json attributes column to a flat string/number map for display. */
function toAttributeMap(value: unknown): Record<string, string | number> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (typeof v === "string" || typeof v === "number") out[k] = v;
  }
  return out;
}

function toListingDetail(row: ListingDetailRow): ListingDetail {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    description: row.description,
    images: row.images,
    priceMinor: row.priceMinor,
    currency: row.currency,
    stock: row.stock,
    type: row.type,
    deliveryType: row.deliveryType,
    attributes: toAttributeMap(row.attributes),
    createdAt: row.createdAt,
    game: row.game,
    category: row.category,
    seller: {
      id: row.seller.id,
      displayName: row.seller.displayName,
      bio: row.seller.bio,
      country: row.seller.country,
      image: row.seller.user.image,
      trustScore: row.seller.trustScore,
      ratingAvg: row.seller.ratingAvg,
      ratingCount: row.seller.ratingCount,
      totalSales: row.seller.totalSales,
      kycVerified: row.seller.kycStatus === "APPROVED",
      memberSince: row.seller.createdAt,
    },
  };
}

/**
 * One ACTIVE listing by slug, with seller + game + category in a single query.
 * cache()-wrapped so the segment layout (404 gate), generateMetadata and the
 * page body all share ONE Neon round trip. Returns null for missing / non-ACTIVE
 * listings (DRAFT/PAUSED/SOLD/REMOVED are never public → the page 404s).
 */
export const getListingBySlug = cache(
  async (slug: string): Promise<ListingDetail | null> => {
    const parsed = slugSchema.safeParse(slug);
    if (!parsed.success) return null;

    const row = await db.listing.findFirst({
      where: { slug: parsed.data, status: ACTIVE },
      include: listingDetailInclude,
    });
    return row ? toListingDetail(row) : null;
  },
);
