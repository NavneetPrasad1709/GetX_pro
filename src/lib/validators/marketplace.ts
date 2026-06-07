import { z } from "zod";
import type { CategoryKind, DeliveryType } from "@prisma/client";
import { minorToMajorString, parsePriceToMinor } from "@/lib/money";

/**
 * Marketplace browse contract (Step 07) — the ONE definition of every filter,
 * sort and pagination param. Used by:
 *   • the server page (parse untrusted ?query → typed filters)
 *   • the marketplace service (build the Prisma where/orderBy)
 *   • the client filter bar (control values + which keys to write to the URL)
 *   • result chips / pagination (serialize filters back to a shareable URL)
 *
 * Everything lives in the URL so results are shareable + SEO-friendly. Prices
 * travel as human MAJOR units (₹) in the URL (`?min=500`) and become integer
 * minor units here (string math, never floats — see lib/money.ts).
 */

export const MARKETPLACE_PAGE_SIZE = 24;
// Mirrors the category page cap: keeps Prisma's 32-bit `skip` safe and turns a
// `?page=999999` into the soft-empty branch instead of a runaway offset.
const MAX_PAGE = 100_000;

export const SORT_KEYS = [
  "newest",
  "price_asc",
  "price_desc",
  "rating",
  "trust",
] as const;
export type SortKey = (typeof SORT_KEYS)[number];

export const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "newest", label: "Newest first" },
  { value: "price_asc", label: "Price: low to high" },
  { value: "price_desc", label: "Price: high to low" },
  { value: "rating", label: "Top rated" },
  { value: "trust", label: "Most trusted" },
];

/** URL param value (lowercase) ↔ Prisma CategoryKind. Footer links use these
 *  (`/marketplace?type=currency`). */
export const TYPE_PARAM_TO_KIND: Record<string, CategoryKind> = {
  account: "ACCOUNT",
  item: "ITEM",
  currency: "CURRENCY",
  boosting: "BOOSTING",
};
const KIND_TO_TYPE_PARAM: Record<CategoryKind, string> = {
  ACCOUNT: "account",
  ITEM: "item",
  CURRENCY: "currency",
  BOOSTING: "boosting",
};

/** Min-seller-trust tiers offered in the UI (value = inclusive lower bound). */
export const TRUST_TIERS = [70, 90] as const;
/** Min-seller-rating tiers offered in the UI. */
export const RATING_TIERS = [4, 4.5] as const;

export type MarketplaceFilters = {
  q?: string;
  game?: string; // game slug
  type?: CategoryKind;
  minPriceMinor?: number;
  maxPriceMinor?: number;
  delivery?: DeliveryType;
  trust?: number; // min seller trustScore (0-100)
  rating?: number; // min seller ratingAvg (0-5)
  currency?: string; // ISO/crypto code, uppercased
  sort: SortKey;
  page: number;
};

// --- per-field coercers (all tolerant: junk → undefined, never throws) -------

const first = (v: string | string[] | undefined): string | undefined =>
  (Array.isArray(v) ? v[0] : v)?.trim() || undefined;

// Search: trim, cap length (defensive — keeps ILIKE patterns bounded).
const Q_MAX = 80;
const slugLike = z.string().regex(/^[a-z0-9-]+$/);
const currencyLike = z.string().regex(/^[A-Za-z]{3,5}$/);

function parsePriceParam(raw: string | undefined): number | undefined {
  if (raw === undefined) return undefined;
  const minor = parsePriceToMinor(raw, "INR");
  return minor === null || minor < 0 ? undefined : minor;
}

function parseIntInRange(
  raw: string | undefined,
  min: number,
  max: number,
): number | undefined {
  if (raw === undefined) return undefined;
  const n = Number(raw);
  if (!Number.isFinite(n)) return undefined;
  const i = Math.trunc(n);
  return i >= min && i <= max ? i : undefined;
}

function parseFloatInRange(
  raw: string | undefined,
  min: number,
  max: number,
): number | undefined {
  if (raw === undefined) return undefined;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < min || n > max) return undefined;
  return n;
}

/**
 * Parse an untrusted Next searchParams object into typed, clamped filters.
 * Never throws — anything malformed is simply dropped (the marketplace always
 * renders something).
 */
export function parseMarketplaceSearchParams(sp: {
  [key: string]: string | string[] | undefined;
}): MarketplaceFilters {
  const q = first(sp.q)?.slice(0, Q_MAX);

  const gameRaw = first(sp.game)?.toLowerCase();
  const game = gameRaw && slugLike.safeParse(gameRaw).success ? gameRaw : undefined;

  const typeRaw = first(sp.type)?.toLowerCase();
  const type = typeRaw ? TYPE_PARAM_TO_KIND[typeRaw] : undefined;

  const deliveryRaw = first(sp.delivery)?.toUpperCase();
  const delivery: DeliveryType | undefined =
    deliveryRaw === "INSTANT" || deliveryRaw === "MANUAL"
      ? deliveryRaw
      : undefined;

  const currencyRaw = first(sp.currency)?.toUpperCase();
  const currency =
    currencyRaw && currencyLike.safeParse(currencyRaw).success
      ? currencyRaw
      : undefined;

  const sortRaw = first(sp.sort);
  const sort: SortKey = SORT_KEYS.includes(sortRaw as SortKey)
    ? (sortRaw as SortKey)
    : "newest";

  // Oversized pages CLAMP to MAX_PAGE (not silently rewrite to 1) so a
  // ?page=999999 still lands past the last page → an honest empty result,
  // never a soft-duplicate of page 1. Garbage / < 1 falls back to page 1.
  const pageNum = Number(first(sp.page));
  const page =
    Number.isFinite(pageNum) && pageNum >= 1
      ? Math.min(Math.trunc(pageNum), MAX_PAGE)
      : 1;

  let minPriceMinor = parsePriceParam(first(sp.min));
  let maxPriceMinor = parsePriceParam(first(sp.max));
  // Inverted range (min > max) is nonsense — swap so it still returns results.
  if (
    minPriceMinor !== undefined &&
    maxPriceMinor !== undefined &&
    minPriceMinor > maxPriceMinor
  ) {
    [minPriceMinor, maxPriceMinor] = [maxPriceMinor, minPriceMinor];
  }

  return {
    q,
    game,
    type,
    minPriceMinor,
    maxPriceMinor,
    delivery,
    trust: parseIntInRange(first(sp.trust), 1, 100),
    rating: parseFloatInRange(first(sp.rating), 0.5, 5),
    currency,
    sort,
    page,
  };
}

/** True when any filter/search narrows the default marketplace view. */
export function hasActiveFilters(f: MarketplaceFilters): boolean {
  return Boolean(
    f.q ||
      f.game ||
      f.type ||
      f.delivery ||
      f.currency ||
      f.minPriceMinor !== undefined ||
      f.maxPriceMinor !== undefined ||
      f.trust !== undefined ||
      f.rating !== undefined,
  );
}

/** True when this is a "thin"/faceted variant that must NOT be indexed
 *  (any filter, search, sort change or page > 1). */
export function isIndexableView(f: MarketplaceFilters): boolean {
  return !hasActiveFilters(f) && f.sort === "newest" && f.page <= 1;
}

/**
 * Serialize filters back to a URLSearchParams (omitting defaults/empties).
 * `overrides` lets callers tweak one key (chips remove a filter; pagination
 * sets the page) without mutating the source object.
 */
export function buildMarketplaceParams(
  f: MarketplaceFilters,
  overrides: Partial<MarketplaceFilters> = {},
): URLSearchParams {
  const merged = { ...f, ...overrides };
  const p = new URLSearchParams();

  if (merged.q) p.set("q", merged.q);
  if (merged.game) p.set("game", merged.game);
  if (merged.type) p.set("type", KIND_TO_TYPE_PARAM[merged.type]);
  if (merged.delivery) p.set("delivery", merged.delivery.toLowerCase());
  if (merged.minPriceMinor !== undefined)
    p.set("min", minorToMajorString(merged.minPriceMinor, "INR"));
  if (merged.maxPriceMinor !== undefined)
    p.set("max", minorToMajorString(merged.maxPriceMinor, "INR"));
  if (merged.trust !== undefined) p.set("trust", String(merged.trust));
  if (merged.rating !== undefined) p.set("rating", String(merged.rating));
  if (merged.currency) p.set("currency", merged.currency);
  if (merged.sort && merged.sort !== "newest") p.set("sort", merged.sort);
  if (merged.page > 1) p.set("page", String(merged.page));

  return p;
}

/** "/marketplace" or "/marketplace?…" for a filter set. */
export function marketplaceHref(
  f: MarketplaceFilters,
  overrides: Partial<MarketplaceFilters> = {},
): string {
  const qs = buildMarketplaceParams(f, overrides).toString();
  return qs ? `/marketplace?${qs}` : "/marketplace";
}
