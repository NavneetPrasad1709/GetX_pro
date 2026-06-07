/**
 * Static per-game marketing + SEO copy for the catalog (Step 05).
 *
 * Why config and not DB: the `Game` table holds catalog data (name/slug/art/
 * order) while marketing copy is hand-written SEO content for our 5 launch
 * games — keeping it here means no migration, code-reviewed copy changes, and
 * zero risk of unescaped user content in meta tags. When a game is added later
 * (Step 30) without copy, `getGameCopy` falls back to safe generated text.
 */

export type GameCopy = {
  slug: string;
  name: string;
  /** Short monogram shown when no cover art exists (v10 cover fallback). */
  mono: string;
  /** Optional local cover art (used until per-game art lands via R2, Step 12). */
  image: string | null;
  /** One-liner under the game name on the landing banner. */
  tagline: string;
  /** <title> for the game landing page (template appends "· GETX"). */
  metaTitle: string;
  /** Meta description + banner paragraph (~150-160 chars, SEO). */
  description: string;
};

/** Launch order mirrors `Game.sortOrder` from the Step 02 seed. */
export const GAME_COPY: GameCopy[] = [
  {
    slug: "pokemon-go",
    name: "Pokemon GO",
    mono: "PoGO",
    image: "/topup-card-template.webp",
    tagline: "Rare shinies, stacked accounts & PokeCoins — delivered safely.",
    metaTitle: "Pokemon GO accounts, PokeCoins & boosting",
    description:
      "Buy Pokemon GO accounts with rare shinies and legendaries, PokeCoins, items and boosting from verified sellers — every order escrow-protected on GETX.",
  },
  {
    slug: "clash-of-clans",
    name: "Clash of Clans",
    mono: "CoC",
    image: null,
    tagline: "Maxed Town Halls, cheap Gems & safe boosting.",
    metaTitle: "Clash of Clans accounts, Gems & boosting",
    description:
      "Buy Clash of Clans accounts from TH12 to maxed TH15, cheap Gems and boosting services from verified sellers — escrow-protected delivery on GETX.",
  },
  {
    slug: "valorant",
    name: "Valorant",
    mono: "VAL",
    image: null,
    tagline: "Ranked accounts, rare skin collections & rank boosting.",
    metaTitle: "Valorant accounts, skins & rank boosting",
    description:
      "Buy Valorant accounts with rare skins and high ranks, or get safe rank boosting from verified sellers — every order is escrow-protected on GETX.",
  },
  {
    slug: "free-fire",
    name: "Free Fire",
    mono: "FF",
    image: null,
    tagline: "Stacked accounts & instant Diamond top-ups by player ID.",
    metaTitle: "Free Fire accounts & Diamond top-ups",
    description:
      "Buy Free Fire accounts and instant Diamond top-ups by player ID from verified sellers — fast delivery with escrow protection on GETX.",
  },
  {
    slug: "pubg-mobile",
    name: "PUBG Mobile",
    mono: "PUBG",
    image: null,
    tagline: "High-tier accounts, cheap UC & rank pushing.",
    metaTitle: "PUBG Mobile accounts, UC & boosting",
    description:
      "Buy PUBG Mobile accounts, cheap UC top-ups and rank boosting from verified sellers — fast, escrow-protected delivery on GETX.",
  },
];

const copyBySlug = new Map(GAME_COPY.map((c) => [c.slug, c]));

/** Title-case a slug: "clash-of-clans" → "Clash Of Clans" (fallback only). */
function humanizeSlug(slug: string): string {
  return slug
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/**
 * Copy for a game, with a safe generated fallback for games that get added
 * to the DB before anyone writes copy for them.
 */
export function getGameCopy(slug: string, name?: string): GameCopy {
  const found = copyBySlug.get(slug);
  if (found) return found;

  const displayName = name ?? humanizeSlug(slug);
  return {
    slug,
    name: displayName,
    mono: displayName
      .split(/\s+/)
      .map((w) => w.charAt(0))
      .join("")
      .toUpperCase()
      .slice(0, 4),
    image: null,
    tagline: "Accounts, items, top-ups & boosting from verified sellers.",
    metaTitle: `${displayName} accounts, items & top-ups`,
    description: `Buy and sell ${displayName} accounts, items, in-game currency and boosting from verified sellers — every order escrow-protected on GETX.`,
  };
}

/** Short badge label per listing type — ONE copy (cards, seller tables…). */
export const LISTING_TYPE_LABEL: Record<
  "ACCOUNT" | "ITEM" | "CURRENCY" | "BOOSTING",
  string
> = {
  ACCOUNT: "Account",
  ITEM: "Item",
  CURRENCY: "Top-up",
  BOOSTING: "Boost",
};

/**
 * Human labels for the dynamic `Listing.attributes` keys, per type — used by
 * the listing detail page (Step 07) to render the seller's attributes as a
 * clean spec table. Keys mirror the attribute schema (lib/validators/listing).
 * An unknown key falls back to a humanized version of the key itself.
 */
export const LISTING_ATTRIBUTE_LABELS: Record<
  "ACCOUNT" | "ITEM" | "CURRENCY" | "BOOSTING",
  Record<string, string>
> = {
  ACCOUNT: { level: "Level", rank: "Rank", server: "Server / region" },
  ITEM: { rarity: "Rarity", server: "Server / region" },
  CURRENCY: { amount: "Amount per unit", unit: "Unit" },
  BOOSTING: {
    currentRank: "From rank",
    desiredRank: "To rank",
    estimatedDays: "Estimated days",
  },
};

/** Category-kind copy used on game + category pages (label comes from the DB). */
export const CATEGORY_KIND_COPY: Record<
  "ACCOUNT" | "ITEM" | "CURRENCY" | "BOOSTING",
  { blurb: (game: string) => string }
> = {
  ACCOUNT: {
    blurb: (game) =>
      `Hand-leveled ${game} accounts with full ownership transfer and a safe, escrow-protected handover.`,
  },
  ITEM: {
    blurb: (game) =>
      `Rare ${game} items and skins, delivered safely by verified sellers.`,
  },
  CURRENCY: {
    blurb: (game) =>
      `Cheap ${game} currency and top-ups — instant delivery on most orders.`,
  },
  BOOSTING: {
    blurb: (game) =>
      `Professional ${game} boosting and rank services with progress updates along the way.`,
  },
};
