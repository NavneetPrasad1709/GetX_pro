/**
 * Step 07 QA harness — exercises the marketplace SERVICE layer directly
 * (search, filters, sort, pagination, ACTIVE-only exposure, listing detail) +
 * the buyer fee math + the URL param parser, against the dev DB.
 * Run: npx tsx scripts/qa-step07.ts   (creates marked data, cleans up after).
 */
import { db } from "../src/lib/db";
import {
  searchListings,
  getListingBySlug,
} from "../src/server/services/marketplace";
import { computeBuyerFee } from "../src/lib/fees";
import {
  parseMarketplaceSearchParams,
  type MarketplaceFilters,
} from "../src/lib/validators/marketplace";

let pass = 0;
let fail = 0;
function ok(name: string, cond: boolean, extra = "") {
  if (cond) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    fail++;
    console.error(`  ✗ ${name} ${extra}`);
  }
}

/** Full filters from a partial (search/sort defaults). */
function f(partial: Partial<MarketplaceFilters>): MarketplaceFilters {
  return { sort: "newest", page: 1, ...partial };
}

async function main() {
  const stamp = Date.now();
  const token = `qa07tok${stamp}`; // unique, lowercase → scopes every search
  const emails = {
    s1: `qa07-s1-${stamp}@test.getx.live`,
    s2: `qa07-s2-${stamp}@test.getx.live`,
  };

  // --- setup: two sellers with very different trust/rating ----------------
  const u1 = await db.user.create({
    data: { email: emails.s1, name: "QA07 High", emailVerified: new Date() },
  });
  const u2 = await db.user.create({
    data: { email: emails.s2, name: "QA07 Low", emailVerified: new Date() },
  });
  const high = await db.sellerProfile.create({
    data: {
      userId: u1.id,
      displayName: "QA07 High Trust",
      kycStatus: "APPROVED",
      trustScore: 95,
      ratingAvg: 4.9,
      ratingCount: 12,
      totalSales: 50,
    },
  });
  const low = await db.sellerProfile.create({
    data: {
      userId: u2.id,
      displayName: "QA07 Low Trust",
      kycStatus: "NONE",
      trustScore: 50,
      ratingAvg: 3,
      ratingCount: 4,
      totalSales: 2,
    },
  });

  // pick a category per kind from the live catalog
  const games = await db.game.findMany({ include: { categories: true } });
  const byKind = (kind: string) => {
    for (const g of games) {
      const c = g.categories.find((c) => c.kind === kind);
      if (c) return { gameId: g.id, categoryId: c.id };
    }
    throw new Error(`no category of kind ${kind}`);
  };

  const mk = async (opts: {
    slug: string;
    sellerId: string;
    kind: "ACCOUNT" | "ITEM" | "CURRENCY" | "BOOSTING";
    priceMinor: number;
    delivery: "MANUAL" | "INSTANT";
    stock: number;
    status: "ACTIVE" | "DRAFT" | "PAUSED";
    inDescription?: boolean;
  }) => {
    const target = byKind(opts.kind);
    return db.listing.create({
      data: {
        sellerId: opts.sellerId,
        gameId: target.gameId,
        categoryId: target.categoryId,
        type: opts.kind,
        title: opts.inDescription
          ? `QA07 ${opts.kind} listing`
          : `QA07 ${opts.kind} ${token} listing`,
        slug: opts.slug,
        description: opts.inDescription
          ? `A boosting offer mentioning ${token} only in the body.`
          : `Automated QA07 listing for ${opts.kind}.`,
        priceMinor: opts.priceMinor,
        currency: "INR",
        stock: opts.stock,
        deliveryType: opts.delivery,
        status: opts.status,
        attributes: {},
      },
    });
  };

  try {
    // l1 ACCOUNT ₹1000 MANUAL high-trust ; l2 ITEM ₹500 INSTANT low-trust
    // l3 CURRENCY ₹2000 INSTANT high-trust ; l4 BOOSTING ₹1500 MANUAL low-trust
    const l1 = await mk({ slug: `qa07-l1-${stamp}`, sellerId: high.id, kind: "ACCOUNT", priceMinor: 100000, delivery: "MANUAL", stock: 1, status: "ACTIVE" });
    await mk({ slug: `qa07-l2-${stamp}`, sellerId: low.id, kind: "ITEM", priceMinor: 50000, delivery: "INSTANT", stock: 5, status: "ACTIVE" });
    await mk({ slug: `qa07-l3-${stamp}`, sellerId: high.id, kind: "CURRENCY", priceMinor: 200000, delivery: "INSTANT", stock: 100, status: "ACTIVE" });
    await mk({ slug: `qa07-l4-${stamp}`, sellerId: low.id, kind: "BOOSTING", priceMinor: 150000, delivery: "MANUAL", stock: 2, status: "ACTIVE" });
    // non-public statuses — must NEVER appear
    const draft = await mk({ slug: `qa07-draft-${stamp}`, sellerId: high.id, kind: "ACCOUNT", priceMinor: 99900, delivery: "MANUAL", stock: 1, status: "DRAFT" });
    await mk({ slug: `qa07-paused-${stamp}`, sellerId: high.id, kind: "ACCOUNT", priceMinor: 99900, delivery: "MANUAL", stock: 1, status: "PAUSED" });
    // description-only match (search must hit the description too)
    await mk({ slug: `qa07-desc-${stamp}`, sellerId: high.id, kind: "BOOSTING", priceMinor: 30000, delivery: "MANUAL", stock: 1, status: "ACTIVE", inDescription: true });

    console.log("\n— search —");
    const all = await searchListings(f({ q: token }));
    // 4 title matches + 1 description-only match = 5 ACTIVE; draft/paused excluded
    ok("search matches title + description, ACTIVE only", all.total === 5, `(total=${all.total})`);
    ok(
      "search never returns DRAFT/PAUSED",
      all.items.every((i) => i.slug !== draft.slug),
    );

    console.log("\n— filters —");
    const acct = await searchListings(f({ q: token, type: "ACCOUNT" }));
    ok("type filter (ACCOUNT)", acct.total === 1 && acct.items[0]?.slug === l1.slug, `(total=${acct.total})`);

    const instant = await searchListings(f({ q: token, delivery: "INSTANT" }));
    ok("delivery filter (INSTANT)", instant.total === 2, `(total=${instant.total})`);

    const priced = await searchListings(f({ q: token, minPriceMinor: 60000, maxPriceMinor: 150000 }));
    ok("price range ₹600–₹1500 → l1 + l4", priced.total === 2, `(total=${priced.total})`);

    const trusted = await searchListings(f({ q: token, trust: 90 }));
    ok(
      "min trust 90 → only high-trust seller's listings",
      trusted.total === 3 && trusted.items.every((i) => (i.seller.trustScore ?? 0) >= 90),
      `(total=${trusted.total})`,
    );

    const rated = await searchListings(f({ q: token, rating: 4 }));
    ok("min rating 4 → only high-rated seller's listings", rated.total === 3, `(total=${rated.total})`);

    console.log("\n— sort —");
    const asc = await searchListings(f({ q: token, sort: "price_asc" }));
    const desc = await searchListings(f({ q: token, sort: "price_desc" }));
    ok("price_asc cheapest first", asc.items[0]?.priceMinor === 30000, `(${asc.items[0]?.priceMinor})`);
    ok("price_desc dearest first", desc.items[0]?.priceMinor === 200000, `(${desc.items[0]?.priceMinor})`);
    const byTrust = await searchListings(f({ q: token, sort: "trust" }));
    ok("sort by trust → highest-trust seller first", (byTrust.items[0]?.seller.trustScore ?? 0) === 95);

    console.log("\n— pagination —");
    ok("page math: 5 results, 1 page", all.pageCount === 1 && all.page === 1);
    const page2 = await searchListings(f({ q: token, page: 2 }));
    ok("page beyond range returns 0 items", page2.items.length === 0);

    console.log("\n— listing detail —");
    const detail = await getListingBySlug(l1.slug);
    ok("getListingBySlug returns the ACTIVE listing + seller", detail?.slug === l1.slug && detail?.seller.trustScore === 95);
    ok("detail includes game + category (no N+1)", !!detail?.game.name && !!detail?.category.name);
    ok("detail seller.kycVerified reflects APPROVED", detail?.seller.kycVerified === true);
    ok("DRAFT listing detail is 404 (null)", (await getListingBySlug(draft.slug)) === null);
    ok("missing slug → null", (await getListingBySlug(`nope-${stamp}`)) === null);
    ok("malformed slug → null (no query)", (await getListingBySlug("Bad Slug!!")) === null);

    console.log("\n— buyer fee math (round-half-up, minor units) —");
    const fee1 = computeBuyerFee(100000, 1);
    ok("₹1000 × 1 → fee ₹50, total ₹1050", fee1.platformFeeMinor === 5000 && fee1.totalMinor === 105000);
    const fee2 = computeBuyerFee(50000, 3);
    ok("₹500 × 3 → subtotal ₹1500, fee ₹75", fee2.subtotalMinor === 150000 && fee2.platformFeeMinor === 7500);
    ok("round-half-up: 5% of 999 → 50 (not 49)", computeBuyerFee(999, 1).platformFeeMinor === 50);
    ok("round-half-up: 5% of 10 → 1 (0.5 ↑)", computeBuyerFee(10, 1).platformFeeMinor === 1);
    ok("qty < 1 clamps to 1", computeBuyerFee(100000, 0).subtotalMinor === 100000);

    console.log("\n— param parser —");
    ok("type=currency → CURRENCY", parseMarketplaceSearchParams({ type: "currency" }).type === "CURRENCY");
    ok("garbage sort → newest default", parseMarketplaceSearchParams({ sort: "boom" }).sort === "newest");
    ok("inverted price range is swapped", (() => {
      const p = parseMarketplaceSearchParams({ min: "5000", max: "100" });
      return p.minPriceMinor! < p.maxPriceMinor!;
    })());
    ok("oversized page clamps", parseMarketplaceSearchParams({ page: "9999999999" }).page === 100000);
    ok("invalid game slug dropped", parseMarketplaceSearchParams({ game: "Bad Slug!" }).game === undefined);
    ok("empty params → indexable defaults", (() => {
      const p = parseMarketplaceSearchParams({});
      return p.sort === "newest" && p.page === 1 && p.q === undefined;
    })());

    console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  } finally {
    await db.listing.deleteMany({
      where: { seller: { user: { email: { in: Object.values(emails) } } } },
    });
    await db.user.deleteMany({ where: { email: { in: Object.values(emails) } } });
    await db.$disconnect();
  }
  if (fail > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
