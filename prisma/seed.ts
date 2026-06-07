/**
 * GETX database seed (Step 02).
 *
 * Idempotent: every write is an upsert keyed on a unique column, so running
 * `npm run db:seed` repeatedly never creates duplicates.
 *
 * Seeds: 5 launch games (+ categories), 1 admin, 2 demo sellers (with wallets),
 * 4 demo listings, 1 demo buyer.
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

  const listings = [
    {
      slug: "pokemon-go-lvl40-200-shinies",
      sellerEmail: "seller1@getx.live",
      gameSlug: "pokemon-go",
      catSlug: "accounts",
      type: "ACCOUNT" as const,
      title: "Level 40 Pokemon GO Account · 200+ Shinies · Legendary Team",
      description:
        "Stacked level 40 account. 200+ shinies, multiple legendaries, 90+ best buddies. Email-changeable, full access handover. Manual delivery within 1 hour.",
      priceMinor: inr(4990),
      stock: 1,
      deliveryType: "MANUAL" as const,
    },
    {
      slug: "coc-th15-max-account",
      sellerEmail: "seller1@getx.live",
      gameSlug: "clash-of-clans",
      catSlug: "accounts",
      type: "ACCOUNT" as const,
      title: "Clash of Clans TH15 Max Account · Legend League",
      description:
        "Town Hall 15 fully maxed, Legend League, all heroes maxed. Supercell ID transferable. Safe escrow handover.",
      priceMinor: inr(7990),
      stock: 1,
      deliveryType: "MANUAL" as const,
    },
    {
      slug: "valorant-immortal-full-skins",
      sellerEmail: "seller2@getx.live",
      gameSlug: "valorant",
      catSlug: "accounts",
      type: "ACCOUNT" as const,
      title: "Valorant Immortal Account · Full Skin Collection",
      description:
        "Immortal-ranked Valorant account with 40+ premium skins including Reaver & Elderflame bundles. Original owner email included.",
      priceMinor: inr(12990),
      stock: 1,
      deliveryType: "MANUAL" as const,
    },
    {
      slug: "free-fire-1000-diamonds-topup",
      sellerEmail: "seller2@getx.live",
      gameSlug: "free-fire",
      catSlug: "diamonds",
      type: "CURRENCY" as const,
      title: "Free Fire · 1000 Diamonds Top-up (by Player ID)",
      description:
        "Instant 1000 diamonds top-up using your Free Fire player ID. No login required. Delivered within minutes.",
      priceMinor: inr(799),
      stock: 100,
      deliveryType: "INSTANT" as const,
    },
  ];

  for (const l of listings) {
    const ids = await categoryId(l.gameSlug, l.catSlug);
    const sellerId = sellerProfilesByEmail[l.sellerEmail];
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
      },
    });
  }
  console.log(`  ✓ ${listings.length} demo listings`);

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
