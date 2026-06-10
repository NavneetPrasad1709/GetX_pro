/**
 * GETX database seed (Step 02).
 *
 * Idempotent: every write is an upsert keyed on a unique column, so running
 * `npm run db:seed` repeatedly never creates duplicates.
 *
 * Seeds: 5 launch games (+ categories), 1 admin, 3 demo sellers (with wallets),
 * 12 demo listings (8 concentrated in Pokémon GO — niche-first), 1 demo buyer.
 *
 * NOTE: demo users have `passwordHash: null` — real credential auth (hashing) is
 * wired in Step 03. These accounts exist so the marketplace has data to render.
 * Run with: npm run db:seed
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// --- catalog data --------------------------------------------------------

type SeedCategory = { name: string; slug: string; kind: "ACCOUNT" | "ITEM" | "CURRENCY" | "BOOSTING" };
type SeedGame = { name: string; slug: string; sortOrder: number; categories: SeedCategory[] };

const GAMES: SeedGame[] = [
  {
    name: "Pokemon GO",
    slug: "pokemon-go",
    sortOrder: 1,
    categories: [
      { name: "Accounts", slug: "accounts", kind: "ACCOUNT" },
      { name: "Items", slug: "items", kind: "ITEM" },
      { name: "PokeCoins", slug: "pokecoins", kind: "CURRENCY" },
      { name: "Boosting", slug: "boosting", kind: "BOOSTING" },
    ],
  },
  {
    name: "Clash of Clans",
    slug: "clash-of-clans",
    sortOrder: 2,
    categories: [
      { name: "Accounts", slug: "accounts", kind: "ACCOUNT" },
      { name: "Gems", slug: "gems", kind: "CURRENCY" },
      { name: "Boosting", slug: "boosting", kind: "BOOSTING" },
    ],
  },
  {
    name: "Valorant",
    slug: "valorant",
    sortOrder: 3,
    categories: [
      { name: "Accounts", slug: "accounts", kind: "ACCOUNT" },
      { name: "Skins", slug: "skins", kind: "ITEM" },
      { name: "Boosting", slug: "boosting", kind: "BOOSTING" },
    ],
  },
  {
    name: "Free Fire",
    slug: "free-fire",
    sortOrder: 4,
    categories: [
      { name: "Accounts", slug: "accounts", kind: "ACCOUNT" },
      { name: "Diamonds", slug: "diamonds", kind: "CURRENCY" },
      { name: "Boosting", slug: "boosting", kind: "BOOSTING" },
    ],
  },
  {
    name: "PUBG Mobile",
    slug: "pubg-mobile",
    sortOrder: 5,
    categories: [
      { name: "Accounts", slug: "accounts", kind: "ACCOUNT" },
      { name: "UC", slug: "uc", kind: "CURRENCY" },
      { name: "Boosting", slug: "boosting", kind: "BOOSTING" },
    ],
  },
];

// --- seller data ---------------------------------------------------------

const SELLERS = [
  {
    email: "seller1@getx.live",
    name: "Aarav Mehta",
    displayName: "ProGamerStore",
    bio: "Verified Pokemon GO & CoC seller. Fast manual delivery, 100% safe.",
    country: "IN",
    kycStatus: "APPROVED" as const,
    trustScore: 92,
    totalSales: 120,
    ratingAvg: 4.8,
    ratingCount: 95,
  },
  {
    email: "seller2@getx.live",
    name: "Ishaan Roy",
    displayName: "EliteAccounts",
    bio: "Premium Valorant & Free Fire accounts. Escrow only.",
    country: "IN",
    kycStatus: "APPROVED" as const,
    trustScore: 85,
    totalSales: 60,
    ratingAvg: 4.6,
    ratingCount: 40,
  },
  {
    // Newcomer — totalSales < NEW_SELLER_BOOST_MAX_SALES (10), so their boosted
    // listings demonstrate the Prompt 12 new-seller visibility boost on ?sort=newest.
    email: "seller3@getx.live",
    name: "Diya Sharma",
    displayName: "PixelRookie",
    bio: "New to GETX — fast, friendly Pokémon GO deals. Every order escrow-protected.",
    country: "IN",
    kycStatus: "PENDING" as const,
    trustScore: 0,
    totalSales: 3,
    ratingAvg: 0,
    ratingCount: 0,
  },
];

// price helpers — rupees -> paisa (minor units)
const inr = (rupees: number) => Math.round(rupees * 100);

async function main() {
  console.log("🌱 Seeding GETX database...");

  // 1) Games + categories ------------------------------------------------
  for (const g of GAMES) {
    const game = await prisma.game.upsert({
      where: { slug: g.slug },
      update: { name: g.name, sortOrder: g.sortOrder, isActive: true },
      create: { name: g.name, slug: g.slug, sortOrder: g.sortOrder, isActive: true },
    });

    for (const c of g.categories) {
      await prisma.category.upsert({
        where: { gameId_slug: { gameId: game.id, slug: c.slug } },
        update: { name: c.name, kind: c.kind },
        create: { name: c.name, slug: c.slug, kind: c.kind, gameId: game.id },
      });
    }
  }
  console.log(`  ✓ ${GAMES.length} games + categories`);

  // 2) Admin -------------------------------------------------------------
  await prisma.user.upsert({
    where: { email: "admin@getx.live" },
    update: { role: "ADMIN" },
    create: {
      email: "admin@getx.live",
      name: "GETX Admin",
      role: "ADMIN",
      emailVerified: new Date(),
    },
  });
  console.log("  ✓ admin user");

  // 3) Sellers (User + SellerProfile + Wallet) ---------------------------
  const sellerProfilesByEmail: Record<string, string> = {};
  for (const s of SELLERS) {
    const user = await prisma.user.upsert({
      where: { email: s.email },
      update: { role: "SELLER", name: s.name },
      create: {
        email: s.email,
        name: s.name,
        role: "SELLER",
        emailVerified: new Date(),
      },
    });

    const profile = await prisma.sellerProfile.upsert({
      where: { userId: user.id },
      update: {
        displayName: s.displayName,
        bio: s.bio,
        country: s.country,
        kycStatus: s.kycStatus,
        trustScore: s.trustScore,
        totalSales: s.totalSales,
        ratingAvg: s.ratingAvg,
        ratingCount: s.ratingCount,
      },
      create: {
        userId: user.id,
        displayName: s.displayName,
        bio: s.bio,
        country: s.country,
        kycStatus: s.kycStatus,
        trustScore: s.trustScore,
        totalSales: s.totalSales,
        ratingAvg: s.ratingAvg,
        ratingCount: s.ratingCount,
      },
    });
    sellerProfilesByEmail[s.email] = profile.id;

    await prisma.wallet.upsert({
      where: { sellerProfileId: profile.id },
      update: {},
      create: { sellerProfileId: profile.id, currency: "INR" },
    });
  }
  console.log(`  ✓ ${SELLERS.length} demo sellers (+ wallets)`);

  // 4) Buyer -------------------------------------------------------------
  await prisma.user.upsert({
    where: { email: "buyer@getx.live" },
    update: { role: "BUYER", name: "Demo Buyer" },
    create: {
      email: "buyer@getx.live",
      name: "Demo Buyer",
      role: "BUYER",
      emailVerified: new Date(),
    },
  });
  console.log("  ✓ demo buyer");

  // 5) Listings ----------------------------------------------------------
  // helper to resolve a category id by game slug + category slug
  const categoryId = async (gameSlug: string, catSlug: string) => {
    const game = await prisma.game.findUniqueOrThrow({ where: { slug: gameSlug } });
    const cat = await prisma.category.findUniqueOrThrow({
      where: { gameId_slug: { gameId: game.id, slug: catSlug } },
    });
    return { gameId: game.id, categoryId: cat.id };
  };

  // `boost: true` → set newSellerBoostUntil (only meaningful for the newcomer,
  // whose totalSales < 10). All listings get a 60-day expiry for the auto-pause cron.
  type SeedListing = {
    slug: string;
    sellerEmail: string;
    gameSlug: string;
    catSlug: string;
    type: "ACCOUNT" | "ITEM" | "CURRENCY" | "BOOSTING";
    title: string;
    description: string;
    priceMinor: number;
    stock: number;
    deliveryType: "MANUAL" | "INSTANT";
    boost?: boolean;
  };

  const listings: SeedListing[] = [
    // --- Pokémon GO (niche-first depth: all 4 categories filled) -----------
    {
      slug: "pokemon-go-lvl40-200-shinies",
      sellerEmail: "seller1@getx.live",
      gameSlug: "pokemon-go",
      catSlug: "accounts",
      type: "ACCOUNT",
      title: "Level 40 Pokemon GO Account · 200+ Shinies · Legendary Team",
      description:
        "Stacked level 40 account. 200+ shinies, multiple legendaries, 90+ best buddies. Email-changeable, full access handover. Manual delivery within 1 hour.",
      priceMinor: inr(4990),
      stock: 1,
      deliveryType: "MANUAL",
    },
    {
      slug: "pokemon-go-lvl35-starter-account",
      sellerEmail: "seller3@getx.live",
      gameSlug: "pokemon-go",
      catSlug: "accounts",
      type: "ACCOUNT",
      title: "Level 35 Pokemon GO Account · Great Starter · 30+ Shinies",
      description:
        "Solid level 35 account to jump straight into raids. 30+ shinies, a few legendaries, decent IV mons. Email-changeable, full access handover.",
      priceMinor: inr(1499),
      stock: 1,
      deliveryType: "MANUAL",
      boost: true,
    },
    {
      slug: "pokemon-go-lvl38-shiny-legendary",
      sellerEmail: "seller1@getx.live",
      gameSlug: "pokemon-go",
      catSlug: "accounts",
      type: "ACCOUNT",
      title: "Level 38 Pokemon GO Account · Shiny Legendaries · 100% Legit",
      description:
        "Level 38 with a strong shiny legendary lineup, high-CP attackers, and plenty of rare candy stocked. Safe escrow handover within the hour.",
      priceMinor: inr(2999),
      stock: 1,
      deliveryType: "MANUAL",
    },
    {
      slug: "pokemon-go-rare-candy-bundle",
      sellerEmail: "seller1@getx.live",
      gameSlug: "pokemon-go",
      catSlug: "items",
      type: "ITEM",
      title: "Pokemon GO · Rare Candy Bundle (200x)",
      description:
        "Bundle of 200 Rare Candy delivered to your account. Power up your favourite legendaries fast. Manual delivery via secure chat after payment.",
      priceMinor: inr(899),
      stock: 25,
      deliveryType: "MANUAL",
    },
    {
      slug: "pokemon-go-tm-bundle",
      sellerEmail: "seller3@getx.live",
      gameSlug: "pokemon-go",
      catSlug: "items",
      type: "ITEM",
      title: "Pokemon GO · Elite TM Bundle (Fast + Charged)",
      description:
        "Elite Fast TM + Elite Charged TM bundle to lock in the exact movesets you want. Manual delivery within a few hours.",
      priceMinor: inr(699),
      stock: 30,
      deliveryType: "MANUAL",
      boost: true,
    },
    {
      slug: "pokemon-go-1000-pokecoins",
      sellerEmail: "seller2@getx.live",
      gameSlug: "pokemon-go",
      catSlug: "pokecoins",
      type: "CURRENCY",
      title: "Pokemon GO · 1000 PokeCoins Top-up",
      description:
        "1000 PokeCoins topped up to your account. Stock your bag, buy incubators and storage. Fast delivery after escrow payment confirms.",
      priceMinor: inr(699),
      stock: 100,
      deliveryType: "INSTANT",
    },
    {
      slug: "pokemon-go-5000-pokecoins",
      sellerEmail: "seller2@getx.live",
      gameSlug: "pokemon-go",
      catSlug: "pokecoins",
      type: "CURRENCY",
      title: "Pokemon GO · 5000 PokeCoins Top-up (Best Value)",
      description:
        "5000 PokeCoins topped up to your account — the best-value bundle for serious trainers. Delivered quickly after payment confirms.",
      priceMinor: inr(2999),
      stock: 50,
      deliveryType: "INSTANT",
    },
    {
      slug: "pokemon-go-boost-lvl1-to-20",
      sellerEmail: "seller1@getx.live",
      gameSlug: "pokemon-go",
      catSlug: "boosting",
      type: "BOOSTING",
      title: "Pokemon GO · Account Leveling 1 → 20 (Boosting)",
      description:
        "We level your account from 1 to 20 safely and quickly — no bots, hand-played. Typical turnaround 5–7 days. You keep full control after handback.",
      priceMinor: inr(3499),
      stock: 3,
      deliveryType: "MANUAL",
    },
    // --- Other launch games -----------------------------------------------
    {
      slug: "coc-th15-max-account",
      sellerEmail: "seller1@getx.live",
      gameSlug: "clash-of-clans",
      catSlug: "accounts",
      type: "ACCOUNT",
      title: "Clash of Clans TH15 Max Account · Legend League",
      description:
        "Town Hall 15 fully maxed, Legend League, all heroes maxed. Supercell ID transferable. Safe escrow handover.",
      priceMinor: inr(7990),
      stock: 1,
      deliveryType: "MANUAL",
    },
    {
      slug: "coc-500-gems",
      sellerEmail: "seller1@getx.live",
      gameSlug: "clash-of-clans",
      catSlug: "gems",
      type: "CURRENCY",
      title: "Clash of Clans · 500 Gems Top-up",
      description:
        "500 gems topped up to your village. Speed up upgrades and finish that hero. Delivered after escrow payment confirms.",
      priceMinor: inr(299),
      stock: 80,
      deliveryType: "INSTANT",
    },
    {
      slug: "valorant-immortal-full-skins",
      sellerEmail: "seller2@getx.live",
      gameSlug: "valorant",
      catSlug: "accounts",
      type: "ACCOUNT",
      title: "Valorant Immortal Account · Full Skin Collection",
      description:
        "Immortal-ranked Valorant account with 40+ premium skins including Reaver & Elderflame bundles. Original owner email included.",
      priceMinor: inr(12990),
      stock: 1,
      deliveryType: "MANUAL",
    },
    {
      slug: "free-fire-1000-diamonds-topup",
      sellerEmail: "seller2@getx.live",
      gameSlug: "free-fire",
      catSlug: "diamonds",
      type: "CURRENCY",
      title: "Free Fire · 1000 Diamonds Top-up (by Player ID)",
      description:
        "Instant 1000 diamonds top-up using your Free Fire player ID. No login required. Delivered within minutes.",
      priceMinor: inr(799),
      stock: 100,
      deliveryType: "INSTANT",
    },
  ];

  const SIXTY_DAYS_MS = 60 * 24 * 60 * 60 * 1000;
  const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

  for (const l of listings) {
    const ids = await categoryId(l.gameSlug, l.catSlug);
    const sellerId = sellerProfilesByEmail[l.sellerEmail];
    const expiresAt = new Date(Date.now() + SIXTY_DAYS_MS);
    const newSellerBoostUntil = l.boost
      ? new Date(Date.now() + SEVEN_DAYS_MS)
      : null;
    await prisma.listing.upsert({
      where: { slug: l.slug },
      update: {
        title: l.title,
        description: l.description,
        priceMinor: l.priceMinor,
        stock: l.stock,
        deliveryType: l.deliveryType,
        status: "ACTIVE",
        type: l.type,
        sellerId,
        gameId: ids.gameId,
        categoryId: ids.categoryId,
        expiresAt,
        newSellerBoostUntil,
      },
      create: {
        slug: l.slug,
        title: l.title,
        description: l.description,
        type: l.type,
        priceMinor: l.priceMinor,
        currency: "INR",
        stock: l.stock,
        deliveryType: l.deliveryType,
        status: "ACTIVE",
        sellerId,
        gameId: ids.gameId,
        categoryId: ids.categoryId,
        expiresAt,
        newSellerBoostUntil,
      },
    });
  }
  console.log(`  ✓ ${listings.length} demo listings`);

  // 6) Community badges (Step 27) — idempotent upsert on the code PK.
  const BADGES = [
    { code: "EARLY_SELLER", name: "Early Seller", description: "One of the first 50 sellers on GETX", iconUrl: "/badges/early-seller.svg" },
    { code: "TOP_SELLER", name: "Top Seller", description: "Top 10 sellers for a game in a calendar month", iconUrl: "/badges/top-seller.svg" },
    { code: "TRUSTED_VETERAN", name: "Trusted Veteran", description: "500+ completed orders", iconUrl: "/badges/trusted-veteran.svg" },
    { code: "GUIDE_AUTHOR", name: "Guide Author", description: "Published at least one community guide", iconUrl: "/badges/guide-author.svg" },
    { code: "COMMUNITY_HERO", name: "Community Hero", description: "Awarded by the GETX team", iconUrl: "/badges/community-hero.svg" },
  ];
  for (const b of BADGES) {
    await prisma.badge.upsert({ where: { code: b.code }, update: { name: b.name, description: b.description, iconUrl: b.iconUrl }, create: b });
  }
  console.log(`  ✓ ${BADGES.length} community badges`);

  console.log("✅ Seed complete.");
}

main()
  .catch((error) => {
    console.error("❌ Seed failed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
