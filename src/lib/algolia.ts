import { algoliasearch, type Algoliasearch } from "algoliasearch";

/**
 * Algolia admin client (Step 28). SERVER-ONLY by discipline: ONLY import this from server code
 * (services / route handlers / scripts), NEVER from a `"use client"` component.
 *
 * The admin key is protected even without the `server-only` package guard: Next.js inlines ONLY
 * `NEXT_PUBLIC_*` env vars into client bundles, so `process.env.ALGOLIA_ADMIN_KEY` is `undefined`
 * in the browser — an accidental client import yields a null client, never a leaked key. (We can't
 * use `import "server-only"` here because it breaks `tsx` scripts + the QA harness that exercise
 * this module directly; the env-var scoping is the real protection.)
 *
 * Algolia is OPTIONAL: with no keys, `getAlgoliaAdminClient()` returns null and every caller falls
 * back to the existing Postgres search (same env-safe pattern as Sentry / R2 / AI). It upgrades the
 * moment the owner provisions an Algolia app and sets the keys — no code change.
 */

export const ALGOLIA_INDEX_NAME = "getx_listings";

let cachedClient: Algoliasearch | null | undefined;

/** The admin client, or null when ALGOLIA_APP_ID / ALGOLIA_ADMIN_KEY are not set. */
export function getAlgoliaAdminClient(): Algoliasearch | null {
  if (cachedClient !== undefined) return cachedClient;
  const appId = process.env.ALGOLIA_APP_ID;
  const adminKey = process.env.ALGOLIA_ADMIN_KEY;
  cachedClient = appId && adminKey ? algoliasearch(appId, adminKey) : null;
  if (!cachedClient) {
    console.warn("Algolia not configured — falling back to Postgres search.");
  }
  return cachedClient;
}

/** True when the search UI + server search path can use Algolia (app id + public search key set). */
export function isAlgoliaConfigured(): boolean {
  return Boolean(process.env.ALGOLIA_APP_ID && process.env.NEXT_PUBLIC_ALGOLIA_SEARCH_KEY);
}

/** The exact record shape stored in the `getx_listings` index. */
export type AlgoliaListingRecord = {
  objectID: string;
  title: string;
  description: string;
  slug: string;
  gameSlug: string;
  gameName: string;
  categoryKind: string;
  categorySlug: string;
  priceMinor: number;
  currency: string;
  type: string;
  sellerUsername: string;
  sellerTrustScore: number;
  sellerRatingAvg: number;
  deliveryType: string;
  status: string;
  createdAt: number; // unix seconds
};

/** The Prisma shape `toAlgoliaRecord` needs (a listing with its game/category/seller joined). */
export type ListingForIndex = {
  id: string;
  title: string;
  description: string;
  slug: string;
  priceMinor: number;
  currency: string;
  type: string;
  deliveryType: string;
  status: string;
  createdAt: Date;
  game: { slug: string; name: string };
  category: { slug: string; kind: string };
  seller: { displayName: string; trustScore: number; ratingAvg: number };
};

export function toAlgoliaRecord(l: ListingForIndex): AlgoliaListingRecord {
  return {
    objectID: l.id,
    title: l.title,
    description: l.description.slice(0, 200), // never index the full body
    slug: l.slug,
    gameSlug: l.game.slug,
    gameName: l.game.name,
    categoryKind: l.category.kind,
    categorySlug: l.category.slug,
    priceMinor: l.priceMinor,
    currency: l.currency,
    type: l.type,
    sellerUsername: l.seller.displayName,
    sellerTrustScore: l.seller.trustScore,
    sellerRatingAvg: l.seller.ratingAvg,
    deliveryType: l.deliveryType,
    status: l.status,
    createdAt: Math.floor(l.createdAt.getTime() / 1000),
  };
}
