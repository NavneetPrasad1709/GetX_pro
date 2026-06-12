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

// ---------------------------------------------------------------------------
// Per game × category SEO landing copy (Prompt 17)
// ---------------------------------------------------------------------------

export type GameCategoryCopy = {
  intro: string; // 2-3 sentence intro under the H1
  bodyParagraphs: string[]; // ~100-word paragraphs at the bottom of the page
  faqs: { q: string; a: string }[]; // 3-5 FAQs → FAQPage JSON-LD
};

/** Hand-written copy for the highest-volume combos. Everything else uses a
 *  genuine parameterized fallback (never spammy filler). */
const GAME_CATEGORY_COPY: Record<string, GameCategoryCopy> = {
  "pokemon-go/accounts": {
    intro:
      "Find hand-leveled Pokémon GO accounts with rare shinies, legendaries and maxed-out Pokédex entries — all listed by verified GETX sellers and protected by escrow from the moment you pay.",
    bodyParagraphs: [
      "Pokémon GO accounts on GETX range from mid-game profiles with a full regional collection to high-level accounts stacked with shiny legendaries and rare event Pokémon. Every listing shows the seller's rating, sales count and a detailed attribute table (level, candy counts, server) so you know exactly what you're buying before checkout.",
      "Our escrow system holds your money until you confirm the account credentials and email have transferred correctly — you have a 3-day window to raise a dispute if anything is wrong, backed by a free money-back guarantee on every order. Sellers face an immediate payout hold if a dispute is opened against them.",
      "Prices vary by level, shiny dex completion and event Pokémon — typical accounts run from $10 starter stacks to $200+ endgame profiles. Use the price filter and sort by seller rating to find the best value in seconds.",
    ],
    faqs: [
      {
        q: "Is it safe to buy a Pokémon GO account on GETX?",
        a: "Yes — your payment is held in escrow and only released to the seller after you confirm the account works. If the login details are wrong or the account isn't as described, open a dispute before the deadline and our team reviews it.",
      },
      {
        q: "How is the account handed over?",
        a: "Sellers deliver the login credentials (and email, where included) through GETX's secure order chat after payment clears. Change the password and recovery email immediately once you have access.",
      },
      {
        q: "What if the account gets recovered by the original owner?",
        a: "Choose listings with full email ownership transfer for the strongest protection, and confirm the handover before the escrow window closes. Any access issue inside the window is covered by a dispute.",
      },
    ],
  },
  "pokemon-go/pokecoins": {
    intro:
      "Top up Pokémon GO PokéCoins at competitive prices with fast, escrow-protected delivery from verified GETX sellers — no account login required for most top-up methods.",
    bodyParagraphs: [
      "PokéCoin top-ups on GETX are delivered to your account quickly after payment, with most sellers offering instant or same-hour fulfilment. Each listing states the exact amount, delivery method and region so there are no surprises at checkout.",
      "Because top-ups compete on price and speed, use the sort options to surface the fastest, best-rated sellers. Your payment stays in escrow until the coins land — if a delivery fails, you're covered by a dispute, not left out of pocket.",
    ],
    faqs: [
      {
        q: "How fast are PokéCoin top-ups delivered?",
        a: "Most sellers deliver within the hour; instant-delivery listings are marked with a ⚡ badge. Delivery time is shown on every listing.",
      },
      {
        q: "Do I need to share my password for a top-up?",
        a: "Usually not — many top-up methods only need your trainer code or player ID. Never share more than a listing's stated requirements; ask the seller in order chat if unsure.",
      },
    ],
  },
};

/**
 * SEO landing copy for a game × category page (Prompt 17). Falls back to genuine,
 * helpful parameterized copy for any combo without a hand-written entry.
 */
export function getGameCategoryCopy(
  gameSlug: string,
  categorySlug: string,
  categoryName: string,
  kind: "ACCOUNT" | "ITEM" | "CURRENCY" | "BOOSTING",
): GameCategoryCopy {
  const hand = GAME_CATEGORY_COPY[`${gameSlug}/${categorySlug}`];
  if (hand) return hand;

  const game = getGameCopy(gameSlug).name;
  const cat = categoryName.toLowerCase();
  return {
    intro: `${CATEGORY_KIND_COPY[kind].blurb(game)} Every order on GETX is escrow-protected — your payment is held safely until you confirm delivery.`,
    bodyParagraphs: [
      `Browse ${game} ${cat} from verified GETX sellers, each with a public rating, sales history and a clear attribute table so you know exactly what you're buying. Filter by price, delivery speed and seller experience to find the right listing in seconds.`,
      `Your money is held in escrow until you confirm the order is as described — a 3-day buyer-protection window with a free money-back guarantee backs every purchase. Sellers are reputation-scored and face an automatic payout hold if a dispute is opened, so the incentive is always to deliver exactly what was promised.`,
    ],
    faqs: [
      {
        q: `Is it safe to buy ${game} ${cat} on GETX?`,
        a: "Yes — escrow holds your payment until you confirm delivery. If anything's wrong, open a dispute before the deadline and our team resolves it fairly.",
      },
      {
        q: "How does delivery work?",
        a: "After payment clears, the seller delivers through GETX's secure order chat (instant for top-ups, usually within a few hours for manual handovers). The delivery method is shown on each listing.",
      },
    ],
  };
}
