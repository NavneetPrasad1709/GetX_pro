import { cache } from "react";
import { Prisma, type CategoryKind, type DeliveryType } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { siteConfig } from "@/config/site";
import {
  listingCardInclude,
  toListingCardData,
} from "@/server/services/catalog";
import { newSellerBoostOrderSql } from "@/server/services/liquidity";
import type { ListingCardData } from "@/components/marketplace/listing-card";
import {
  MARKETPLACE_PAGE_SIZE,
  type MarketplaceFilters,
  type SortKey,
} from "@/lib/validators/marketplace";
import { logSearch } from "@/server/services/demand-forecast";
import { getAlgoliaAdminClient, isAlgoliaConfigured, ALGOLIA_INDEX_NAME } from "@/lib/algolia";
import { captureServerEvent } from "@/lib/posthog";

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

  // Seller filters on the to-one relation (trustScore + kycStatus are indexed;
  // totalSales index added in the Prompt-08 migration). All fold into ONE nested
  // filter so they AND together (never overwrite each other).
  if (
    f.trust !== undefined ||
    f.rating !== undefined ||
    f.minSales !== undefined ||
    f.verified
  ) {
    where.seller = {
      ...(f.trust !== undefined ? { trustScore: { gte: f.trust } } : {}),
      ...(f.rating !== undefined ? { ratingAvg: { gte: f.rating } } : {}),
      ...(f.minSales !== undefined ? { totalSales: { gte: f.minSales } } : {}),
      ...(f.verified ? { kycStatus: "APPROVED" as const } : {}),
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
    case "popular":
    case "best_seller": // alias — both rank by proven seller sales (Prompt 12)
      return [
        { seller: { totalSales: "desc" } },
        { seller: { ratingAvg: "desc" } },
        { id: "desc" },
      ];
    case "newest":
    default:
      return [{ createdAt: "desc" }, { id: "desc" }];
  }
}

/**
 * The same filter set as buildWhere(), expressed as a composed Prisma.Sql for
 * the new-seller-boosted `newest` path (Prisma's orderBy can't express the
 * `newSellerBoostUntil > NOW()` conditional). KEEP IN SYNC with buildWhere —
 * both must select the identical row set; only ordering differs. All values are
 * parameterized (never string-interpolated) → injection-safe.
 */
function buildWhereSql(f: MarketplaceFilters): Prisma.Sql {
  const conds: Prisma.Sql[] = [Prisma.sql`l.status = 'ACTIVE'`];

  if (f.q) {
    const pat = `%${f.q}%`;
    conds.push(
      Prisma.sql`(l.title ILIKE ${pat} OR l.description ILIKE ${pat})`,
    );
  }
  if (f.game) {
    conds.push(Prisma.sql`g.slug = ${f.game} AND g."isActive" = true`);
  }
  if (f.type) conds.push(Prisma.sql`l.type::text = ${f.type}`);
  if (f.delivery)
    conds.push(Prisma.sql`l."deliveryType"::text = ${f.delivery}`);
  if (f.currency) conds.push(Prisma.sql`l.currency = ${f.currency}`);
  if (f.minPriceMinor !== undefined)
    conds.push(Prisma.sql`l."priceMinor" >= ${f.minPriceMinor}`);
  if (f.maxPriceMinor !== undefined)
    conds.push(Prisma.sql`l."priceMinor" <= ${f.maxPriceMinor}`);
  if (f.trust !== undefined)
    conds.push(Prisma.sql`sp."trustScore" >= ${f.trust}`);
  if (f.rating !== undefined)
    conds.push(Prisma.sql`sp."ratingAvg" >= ${f.rating}`);
  if (f.minSales !== undefined)
    conds.push(Prisma.sql`sp."totalSales" >= ${f.minSales}`);
  if (f.verified) conds.push(Prisma.sql`sp."kycStatus"::text = 'APPROVED'`);

  return Prisma.join(conds, " AND ");
}

/**
 * The `newest` sort with the new-seller visibility boost (Prompt 12): listings
 * from sellers still in their 7-day window (and under the sales threshold) rank
 * first, then everything by recency. Raw SQL selects the ordered IDs; Prisma
 * hydrates the relations (so we keep ONE include + the card mapper) and the SQL
 * order is restored in memory. Count reuses the Prisma buildWhere (same rows).
 */
async function searchListingsNewestBoosted(
  f: MarketplaceFilters,
): Promise<MarketplaceResultPage> {
  const whereSql = buildWhereSql(f);
  const boost = newSellerBoostOrderSql(
    siteConfig.liquidity.newSellerBoostMaxSales,
  );
  const offset = (f.page - 1) * MARKETPLACE_PAGE_SIZE;

  const [idRows, total, featured] = await Promise.all([
    db.$queryRaw<{ id: string }[]>(Prisma.sql`
      SELECT l.id
      FROM "Listing" l
      JOIN "SellerProfile" sp ON sp.id = l."sellerId"
      JOIN "Game" g ON g.id = l."gameId"
      WHERE ${whereSql}
      ORDER BY ${boost} DESC, COALESCE(l."bumpedAt", l."createdAt") DESC, l.id DESC
      LIMIT ${MARKETPLACE_PAGE_SIZE} OFFSET ${offset}
    `),
    db.listing.count({ where: buildWhere(f) }),
    featuredForFilters(f),
  ]);

  const ids = idRows.map((r) => r.id);
  const rows = ids.length
    ? await db.listing.findMany({
        where: { id: { in: ids } },
        include: listingCardInclude,
      })
    : [];
  const byId = new Map(rows.map((r) => [r.id, r]));
  const ordered = ids
    .map((id) => byId.get(id))
    .filter((r): r is (typeof rows)[number] => Boolean(r));

  return {
    items: ordered.map(toListingCardData),
    featured,
    total,
    page: f.page,
    pageCount: Math.max(1, Math.ceil(total / MARKETPLACE_PAGE_SIZE)),
    pageSize: MARKETPLACE_PAGE_SIZE,
  };
}

export type MarketplaceResultPage = {
  items: ListingCardData[];
  /** Paid "Promoted" listings shown above organics (page 1 only) — Prompt 15. */
  featured: ListingCardData[];
  total: number;
  page: number;
  pageCount: number;
  pageSize: number;
};

/**
 * Paid featured ("Promoted") listings (Prompt 15). Active boost = isFeatured +
 * boostExpiresAt in the future. Optionally scoped to a game/type and gated by a
 * minimum seller rating (homepage quality gate). Ordered by most-recently-boosted.
 */
export async function getFeaturedListings(opts?: {
  gameSlug?: string;
  type?: CategoryKind;
  minSellerRating?: number;
  limit?: number;
  now?: Date;
}): Promise<ListingCardData[]> {
  const now = opts?.now ?? new Date();
  const where: Prisma.ListingWhereInput = {
    status: ACTIVE,
    isFeatured: true,
    boostExpiresAt: { gt: now },
    stock: { gt: 0 },
  };
  if (opts?.gameSlug) where.game = { slug: opts.gameSlug, isActive: true };
  if (opts?.type) where.type = opts.type;
  if (opts?.minSellerRating !== undefined) {
    where.seller = { ratingAvg: { gte: opts.minSellerRating } };
  }

  const rows = await db.listing.findMany({
    where,
    orderBy: { boostExpiresAt: "desc" },
    take: opts?.limit ?? siteConfig.fees.boost.maxFeaturedPerPage,
    include: listingCardInclude,
  });
  return rows.map(toListingCardData);
}

/**
 * Related-listing rails for the listing page (Prompt 17) — drive session depth.
 * cache()-wrapped + ACTIVE-only + small `take`; run in parallel with the page's
 * other queries so they add no waterfall latency.
 */
export const getMoreFromSeller = cache(
  async (
    sellerProfileId: string,
    excludeSlug: string,
    limit = 4,
  ): Promise<ListingCardData[]> => {
    const rows = await db.listing.findMany({
      where: { sellerId: sellerProfileId, status: ACTIVE, slug: { not: excludeSlug } },
      orderBy: { createdAt: "desc" },
      take: limit,
      include: listingCardInclude,
    });
    return rows.map(toListingCardData);
  },
);

export const getMoreInCategory = cache(
  async (
    gameSlug: string,
    categorySlug: string,
    excludeSlug: string,
    limit = 4,
  ): Promise<ListingCardData[]> => {
    const rows = await db.listing.findMany({
      where: {
        status: ACTIVE,
        slug: { not: excludeSlug },
        game: { slug: gameSlug },
        category: { slug: categorySlug },
      },
      // Show the best, not just the newest (most useful for discovery).
      orderBy: [{ seller: { ratingAvg: "desc" } }, { createdAt: "desc" }],
      take: limit,
      include: listingCardInclude,
    });
    return rows.map(toListingCardData);
  },
);

export type SpotlightSeller = {
  id: string;
  displayName: string;
  image: string | null;
  ratingAvg: number;
  ratingCount: number;
  totalSales: number;
  sellerLevel: string;
};

/** Active spotlight-sponsored sellers (Prompt 15b, Stream 3) for the homepage rail. */
export async function getSponsoredSellers(
  limit = 3,
  now = new Date(),
): Promise<SpotlightSeller[]> {
  const rows = await db.sellerProfile.findMany({
    where: { isSponsored: true, sponsorshipExpiresAt: { gt: now } },
    orderBy: { sponsorshipExpiresAt: "desc" },
    take: limit,
    select: {
      id: true,
      displayName: true,
      ratingAvg: true,
      ratingCount: true,
      totalSales: true,
      sellerLevel: true,
      user: { select: { image: true } },
    },
  });
  return rows.map((r) => ({
    id: r.id,
    displayName: r.displayName,
    image: r.user.image,
    ratingAvg: r.ratingAvg,
    ratingCount: r.ratingCount,
    totalSales: r.totalSales,
    sellerLevel: r.sellerLevel,
  }));
}

/** Featured row for the marketplace browse (page 1 only, scoped to active filters). */
function featuredForFilters(f: MarketplaceFilters): Promise<ListingCardData[]> {
  if (f.page > 1) return Promise.resolve([]); // promoted band only on page 1
  return getFeaturedListings({ gameSlug: f.game, type: f.type });
}

/** One page of marketplace results for the given filters. */
// Algolia sort → replica index name (price/recency). Other sorts use the main (trust-ranked) index.
const SORT_REPLICA: Partial<Record<SortKey, string>> = {
  price_asc: `${ALGOLIA_INDEX_NAME}_price_asc`,
  price_desc: `${ALGOLIA_INDEX_NAME}_price_desc`,
  newest: `${ALGOLIA_INDEX_NAME}_newest`,
};

/**
 * Algolia search path (Step 28). Algolia handles query/typo/ranking + returns objectIDs; Postgres
 * hydrates the exact card shape so the UI is unaware which backend served the results. Returns null
 * on ANY error (or when not configured) → the caller falls back to the Postgres path unchanged.
 */
async function searchListingsViaAlgolia(
  f: MarketplaceFilters,
): Promise<MarketplaceResultPage | null> {
  const client = getAlgoliaAdminClient();
  if (!client) return null;
  try {
    const filters = ["status:ACTIVE"];
    if (f.game) filters.push(`gameSlug:${JSON.stringify(f.game)}`);
    if (f.type) filters.push(`categoryKind:${f.type}`);
    if (f.minPriceMinor != null) filters.push(`priceMinor >= ${f.minPriceMinor}`);
    if (f.maxPriceMinor != null) filters.push(`priceMinor <= ${f.maxPriceMinor}`);

    const res = await client.searchSingleIndex<{ objectID: string }>({
      indexName: SORT_REPLICA[f.sort] ?? ALGOLIA_INDEX_NAME,
      searchParams: {
        query: f.q ?? "",
        filters: filters.join(" AND "),
        page: Math.max(0, f.page - 1),
        hitsPerPage: MARKETPLACE_PAGE_SIZE,
      },
    });

    const total = res.nbHits ?? 0;
    const ids = res.hits.map((h) => h.objectID);
    const base = {
      featured: await featuredForFilters(f),
      total,
      page: f.page,
      pageCount: Math.max(1, Math.ceil(total / MARKETPLACE_PAGE_SIZE)),
      pageSize: MARKETPLACE_PAGE_SIZE,
    };
    if (ids.length === 0) return { items: [], ...base };

    // Hydrate from Postgres in Algolia's ranked order (re-check ACTIVE — index can lag).
    const rows = await db.listing.findMany({
      where: { id: { in: ids }, status: ACTIVE },
      include: listingCardInclude,
    });
    const byId = new Map(rows.map((r) => [r.id, r]));
    const items = ids
      .map((id) => byId.get(id))
      .filter((r): r is NonNullable<typeof r> => Boolean(r))
      .map(toListingCardData);
    return { items, ...base };
  } catch (err) {
    console.error("[algolia] search failed — falling back to Postgres", err);
    return null;
  }
}

export async function searchListings(
  f: MarketplaceFilters,
): Promise<MarketplaceResultPage> {
  // Demand signal (Step 26): log the search term fire-and-forget — never blocks/throws.
  logSearch(f.q, f.game);

  // Algolia path (Step 28) when configured; null result (error/unconfigured) → Postgres.
  let result: MarketplaceResultPage | null = null;
  if (isAlgoliaConfigured()) result = await searchListingsViaAlgolia(f);
  if (!result) result = await searchListingsPostgres(f);

  // Analytics (Step 31): unauthenticated search funnel event — query truncated, NO userId/PII.
  const q = f.q?.trim();
  if (q) {
    captureServerEvent("search_performed", "anonymous", {
      query: q.substring(0, 100),
      resultCount: result.items.length,
      gameId: f.game ?? null,
    });
  }
  return result;
}

/** Postgres search (the fallback / non-Algolia path) — newest-boost sort + the fast findMany path. */
async function searchListingsPostgres(f: MarketplaceFilters): Promise<MarketplaceResultPage> {
  // The `newest` sort (also the default) applies the new-seller boost via raw SQL ordering.
  if (f.sort === "newest") {
    return searchListingsNewestBoosted(f);
  }

  const where = buildWhere(f);
  const [rows, total, featured] = await Promise.all([
    db.listing.findMany({
      where,
      orderBy: buildOrderBy(f.sort),
      skip: (f.page - 1) * MARKETPLACE_PAGE_SIZE,
      take: MARKETPLACE_PAGE_SIZE,
      include: listingCardInclude,
    }),
    db.listing.count({ where }),
    featuredForFilters(f),
  ]);

  return {
    items: rows.map(toListingCardData),
    featured,
    total,
    page: f.page,
    pageCount: Math.max(1, Math.ceil(total / MARKETPLACE_PAGE_SIZE)),
    pageSize: MARKETPLACE_PAGE_SIZE,
  };
}

export type FacetCounts = {
  byGame: { slug: string; name: string; count: number }[];
  byType: { type: CategoryKind; count: number }[];
};

/**
 * Cheap game + type facet counts for the current filters (Prompt 08) — prevents
 * dead-end filter clicks. Game counts STRIP the game dimension (picking a game
 * still shows every game's count); type counts keep the active game scope. Two
 * groupBys + one small game-name lookup, one Neon round trip. Reuses buildWhere
 * so the ACTIVE-only guard applies to counts too. Not cache()-wrapped.
 */
export async function getFacetCounts(
  f: MarketplaceFilters,
): Promise<FacetCounts> {
  const gameBaseWhere = buildWhere({ ...f, game: undefined, type: undefined });
  const typeBaseWhere = buildWhere({ ...f, type: undefined }); // keep game scope

  const [byGameRaw, byTypeRaw] = await db.$transaction([
    db.listing.groupBy({
      by: ["gameId"],
      where: gameBaseWhere,
      orderBy: { gameId: "asc" },
      _count: true,
    }),
    db.listing.groupBy({
      by: ["type"],
      where: typeBaseWhere,
      orderBy: { type: "asc" },
      _count: true,
    }),
  ]);

  const gameIds = byGameRaw.map((g) => g.gameId);
  const gameMeta = gameIds.length
    ? await db.game.findMany({
        where: { id: { in: gameIds } },
        select: { id: true, name: true, slug: true },
      })
    : [];
  const metaById = new Map(gameMeta.map((g) => [g.id, g]));

  // groupBy `_count` is loosely typed by Prisma; at runtime `_count: true`
  // yields a number — coerce defensively.
  const countOf = (c: unknown): number => (typeof c === "number" ? c : 0);

  const byGame = byGameRaw
    .map((g) => {
      const meta = metaById.get(g.gameId);
      return meta
        ? { slug: meta.slug, name: meta.name, count: countOf(g._count) }
        : null;
    })
    .filter((x): x is { slug: string; name: string; count: number } => x !== null)
    .sort((a, b) => b.count - a.count);

  const byType = byTypeRaw
    .map((t) => ({ type: t.type, count: countOf(t._count) }))
    .sort((a, b) => b.count - a.count);

  return { byGame, byType };
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
      userId: true,
      displayName: true,
      bio: true,
      country: true,
      trustScore: true,
      ratingAvg: true,
      ratingCount: true,
      totalSales: true,
      kycStatus: true,
      sellerLevel: true,
      subscriptionTier: true,
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
    userId: string;
    displayName: string;
    bio: string | null;
    country: string | null;
    image: string | null;
    trustScore: number;
    ratingAvg: number;
    ratingCount: number;
    totalSales: number;
    kycVerified: boolean;
    sellerLevel: string;
    proMember: boolean;
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
      userId: row.seller.userId,
      displayName: row.seller.displayName,
      bio: row.seller.bio,
      country: row.seller.country,
      image: row.seller.user.image,
      trustScore: row.seller.trustScore,
      ratingAvg: row.seller.ratingAvg,
      ratingCount: row.seller.ratingCount,
      totalSales: row.seller.totalSales,
      kycVerified: row.seller.kycStatus === "APPROVED",
      sellerLevel: row.seller.sellerLevel,
      proMember: row.seller.subscriptionTier === "PRO",
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
