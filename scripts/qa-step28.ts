/**
 * Step 28 QA — Algolia search. The dev env has NO Algolia keys, so this proves the GRACEFUL path:
 * helpers report unconfigured + return null, sync/bulk are safe no-ops (never throw), the record
 * mapper is correct (200-char description), the Postgres search fallback still serves results, and
 * the sync cron is fail-closed (401 without bearer, 200 "skipped" with bearer). Live-Algolia checks
 * (typo tolerance, getObject) are skipped + logged when keys are absent. Cleans up in finally.
 * Run: npx tsx scripts/qa-step28.ts
 */
import { db } from "../src/lib/db";
import {
  isAlgoliaConfigured,
  getAlgoliaAdminClient,
  toAlgoliaRecord,
} from "../src/lib/algolia";
import { syncListingToAlgolia, bulkSyncAllListings } from "../src/server/services/search-sync";
import { searchListings } from "../src/server/services/marketplace";
import { createListing } from "../src/server/services/listings";
import { GET as algoliaSyncCron } from "../src/app/api/cron/algolia-sync/route";

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
async function threw(fn: () => Promise<unknown>): Promise<boolean> {
  try {
    await fn();
    return false;
  } catch {
    return true;
  }
}

async function main() {
  const stamp = Date.now();
  const configured = isAlgoliaConfigured();

  const sellerUser = await db.user.create({ data: { email: `qa28-s-${stamp}@test.getx.live`, name: "QA28 Seller", emailVerified: new Date(), emailNotifications: false } });
  const seller = await db.sellerProfile.create({ data: { userId: sellerUser.id, displayName: "QA28 Store", kycStatus: "APPROVED" } });
  const game = await db.game.findFirstOrThrow({ include: { categories: true } });
  const cat = game.categories[0];
  let listingId = "";

  try {
    console.log(`\n=== config (Algolia ${configured ? "configured" : "NOT configured — testing fallback"}) ===`);
    ok("isAlgoliaConfigured reflects env", configured === Boolean(process.env.ALGOLIA_APP_ID && process.env.NEXT_PUBLIC_ALGOLIA_SEARCH_KEY));
    ok("admin client null without keys", configured || getAlgoliaAdminClient() === null);

    console.log("\n=== record mapper ===");
    const rec = toAlgoliaRecord({
      id: "listing-x", title: "Lv40 Account", description: "a".repeat(500), slug: "lv40-x",
      priceMinor: 100000, currency: "INR", type: "ACCOUNT", deliveryType: "MANUAL", status: "ACTIVE",
      createdAt: new Date("2026-01-01T00:00:00Z"),
      game: { slug: "pokemon-go", name: "Pokémon GO" }, category: { slug: "accounts", kind: "ACCOUNT" },
      seller: { displayName: "Store", trustScore: 88, ratingAvg: 4.7 },
    });
    ok("objectID = listing id", rec.objectID === "listing-x");
    ok("description truncated to 200 chars", rec.description.length === 200);
    ok("createdAt is unix seconds (integer)", Number.isInteger(rec.createdAt) && rec.createdAt > 0);
    ok("seller + game fields mapped", rec.sellerTrustScore === 88 && rec.gameName === "Pokémon GO" && rec.categoryKind === "ACCOUNT");

    console.log("\n=== sync is a safe no-op without keys ===");
    ok("syncListingToAlgolia never throws", !(await threw(() => syncListingToAlgolia("nonexistent-id"))));
    const bulk = await bulkSyncAllListings();
    ok("bulkSyncAllListings returns a summary, errors 0", bulk.errors === 0 && typeof bulk.synced === "number" && typeof bulk.deleted === "number");
    if (!configured) ok("bulk no-op without keys (synced 0)", bulk.synced === 0 && bulk.deleted === 0);

    console.log("\n=== Postgres search fallback still works ===");
    const uniq = `qa28zx${stamp}`;
    await createListing({ id: sellerUser.id, role: "SELLER" }, { gameId: game.id, categoryId: cat.id, type: cat.kind, title: `Rare ${uniq} bundle`, description: "Search fallback QA.", price: 100000, stock: 5, deliveryType: "MANUAL", attributes: {}, images: [], publish: true });
    const listing = await db.listing.findFirstOrThrow({ where: { sellerId: seller.id }, orderBy: { createdAt: "desc" } });
    listingId = listing.id;
    const res = await searchListings({ q: uniq, sort: "newest", page: 1 });
    ok("search returns the matching listing (Postgres path)", res.items.some((i) => i.id === listingId), `total=${res.total}`);
    ok("result shape intact (page/pageSize/total)", res.page === 1 && res.pageSize > 0 && typeof res.total === "number");

    console.log("\n=== sync cron is fail-closed ===");
    const savedSecret = process.env.CRON_SECRET;
    process.env.CRON_SECRET = "qa28-secret";
    const noAuth = await algoliaSyncCron(new Request("http://localhost/api/cron/algolia-sync"));
    ok("401 without bearer", noAuth.status === 401);
    const withAuth = await algoliaSyncCron(new Request("http://localhost/api/cron/algolia-sync", { headers: { authorization: "Bearer qa28-secret" } }));
    ok("200 with correct bearer", withAuth.status === 200);
    const body = (await withAuth.json()) as { ok?: boolean; skipped?: string };
    ok("cron body ok:true", body.ok === true);
    if (!configured) ok("cron reports 'skipped' when Algolia unconfigured", body.skipped === "algolia not configured");
    if (savedSecret === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = savedSecret;

    if (!configured) {
      console.log("  • live-Algolia checks (typo tolerance, getObject) skipped — no ALGOLIA keys in dev");
    }
  } finally {
    if (listingId) await db.listing.deleteMany({ where: { id: listingId } });
    await db.sellerProfile.deleteMany({ where: { id: seller.id } });
    await db.user.deleteMany({ where: { id: sellerUser.id } });
  }

  console.log(`\n${fail === 0 ? "✅" : "❌"} Step 28 QA — ${pass} passed, ${fail} failed`);
  if (fail > 0) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
