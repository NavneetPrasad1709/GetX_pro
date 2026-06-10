/**
 * Step 26 QA — demand forecast + pricing. Drives the REAL aggregation + services against the dev DB:
 * cron aggregation (correct orderCount/avgPrice + idempotent upsert), fire-and-forget search logging
 * (+ empty-query skip), and the low-data fallbacks for forecast/pricing (no AI call). Cleans up in
 * finally. Run: npx tsx scripts/qa-step26.ts
 */
import { db } from "../src/lib/db";
import { createListing } from "../src/server/services/listings";
import {
  aggregateMarketSignals,
  getDemandForecast,
  getPricingRecommendation,
  logSearch,
} from "../src/server/services/demand-forecast";

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
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const stamp = Date.now();
  const DAY_MS = 86_400_000;
  const testDay = new Date(Math.floor(Date.now() / DAY_MS) * DAY_MS - 3 * DAY_MS); // 3 days ago, UTC midnight
  const noon = new Date(testDay.getTime() + 12 * 3600 * 1000);
  const searchTerm = `qa26 shiny ${stamp}`;

  const buyer = await db.user.create({ data: { email: `qa26-b-${stamp}@test.getx.live`, name: "QA26 Buyer", emailVerified: new Date(), emailNotifications: false } });
  const sellerUser = await db.user.create({ data: { email: `qa26-s-${stamp}@test.getx.live`, name: "QA26 Seller", emailVerified: new Date(), emailNotifications: false } });
  const seller = await db.sellerProfile.create({ data: { userId: sellerUser.id, displayName: "QA26 Store", kycStatus: "APPROVED" } });
  const game = await db.game.findFirstOrThrow({ include: { categories: true } });
  const cat = game.categories[0];

  let listingId = "";
  const orderIds: string[] = [];

  try {
    await createListing({ id: sellerUser.id, role: "SELLER" }, { gameId: game.id, categoryId: cat.id, type: cat.kind, title: `QA26 Listing ${stamp}`, description: "Demand QA.", price: 100000, stock: 50, deliveryType: "MANUAL", attributes: {}, images: [], publish: true });
    const listing = await db.listing.findFirstOrThrow({ where: { sellerId: seller.id }, orderBy: { createdAt: "desc" } });
    listingId = listing.id;

    // Two COMPLETED orders dated to the test day (₹1000 + ₹2000 → avg ₹1500 = 150000 paise).
    for (const unit of [100000, 200000]) {
      const o = await db.order.create({ data: { buyerId: buyer.id, sellerId: seller.id, listingId, qty: 1, unitPriceMinor: unit, feeMinor: Math.round(unit * 0.05), sellerFeeMinor: Math.round(unit * 0.08), totalMinor: unit + Math.round(unit * 0.05), currency: "INR", status: "COMPLETED" } });
      orderIds.push(o.id);
      await db.$executeRaw`UPDATE "Order" SET "updatedAt" = ${noon} WHERE id = ${o.id}`;
    }

    console.log("\n=== cron aggregation ===");
    const n1 = await aggregateMarketSignals(testDay);
    ok("aggregation upserted at least one signal", n1 >= 1, `got ${n1}`);
    const sig = await db.marketSignal.findFirst({ where: { gameId: game.id, categoryKind: cat.kind, date: testDay } });
    ok("signal row created for the test game+category", sig !== null);
    ok("orderCount = 2", sig?.orderCount === 2, `got ${sig?.orderCount}`);
    ok("avgPriceMinor = 150000 (₹1500)", sig?.avgPriceMinor === 150000, `got ${sig?.avgPriceMinor}`);

    const n2 = await aggregateMarketSignals(testDay);
    const sigCount = await db.marketSignal.count({ where: { gameId: game.id, categoryKind: cat.kind, date: testDay } });
    ok("idempotent: re-run does not duplicate the signal", sigCount === 1, `count=${sigCount}`);
    ok("idempotent: same upsert count", n2 === n1);

    console.log("\n=== search logging (fire-and-forget) ===");
    logSearch(searchTerm, game.slug);
    await sleep(300); // let the detached insert land
    ok("search term logged", (await db.searchLog.count({ where: { query: searchTerm } })) === 1);
    logSearch("   ", game.slug);
    logSearch(undefined, undefined);
    await sleep(150);
    ok("blank/undefined query is NOT logged", (await db.searchLog.count({ where: { query: { in: ["", "   "] } } })) === 0);

    console.log("\n=== forecast + pricing low-data fallbacks (no AI call) ===");
    const forecast = await getDemandForecast(game.id, cat.kind);
    ok("forecast with <3 signals → MEDIUM low-data fallback", forecast?.level === "MEDIUM" && forecast.dataPoints < 3, `got ${JSON.stringify(forecast)}`);
    const pricing = await getPricingRecommendation(listingId);
    ok("pricing with <3 signals → KEEP at current price", pricing?.action === "KEEP" && pricing.suggestedPriceMinor === 100000, `got ${JSON.stringify(pricing)}`);
    ok("pricing for a non-existent listing → null", (await getPricingRecommendation("nope-not-real")) === null);
  } finally {
    await db.marketSignal.deleteMany({ where: { gameId: game.id, categoryKind: cat.kind, date: testDay } });
    await db.searchLog.deleteMany({ where: { query: { startsWith: "qa26 " } } });
    await db.order.deleteMany({ where: { id: { in: orderIds } } });
    if (listingId) await db.listing.deleteMany({ where: { id: listingId } });
    await db.sellerProfile.deleteMany({ where: { id: seller.id } });
    await db.user.deleteMany({ where: { id: { in: [buyer.id, sellerUser.id] } } });
  }

  console.log(`\n${fail === 0 ? "✅" : "❌"} Step 26 QA — ${pass} passed, ${fail} failed`);
  if (fail > 0) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
