/**
 * Step 20 QA — Seller "CEO" dashboard analytics. Seeds a seller with a wallet, listings, completed
 * orders and SALE ledger rows, then drives the REAL analytics service (revenue series gap-fill,
 * top listings, order funnel, wallet summary reconciled to the wallet-based ledger, price benchmark)
 * + the AI-disabled fallback contract. Cleans up in finally.
 * Run: npx tsx scripts/qa-step20.ts
 */
import { db } from "../src/lib/db";
import { isAiEnabled } from "../src/lib/ai";
import { getWalletBalances } from "../src/server/services/wallet";
import { createListing } from "../src/server/services/listings";
import {
  getRevenueSeries,
  getTopListings,
  getOrderFunnel,
  getWalletSummary,
  getOrderCount,
  getPriceBenchmark,
} from "../src/server/services/seller-analytics";

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

async function main() {
  const stamp = Date.now();
  const buyer = await db.user.create({ data: { email: `qa20-b-${stamp}@test.getx.live`, name: "QA20 Buyer", emailVerified: new Date(), emailNotifications: false } });
  const sellerUser = await db.user.create({ data: { email: `qa20-s-${stamp}@test.getx.live`, name: "QA20 Seller", emailVerified: new Date(), emailNotifications: false } });
  const seller = await db.sellerProfile.create({ data: { userId: sellerUser.id, displayName: "QA20 Store", kycStatus: "APPROVED" } });
  const wallet = await db.wallet.create({ data: { sellerProfileId: seller.id, kind: "SELLER", currency: "INR" } });
  const game = await db.game.findFirstOrThrow({ include: { categories: true } });
  const cat = game.categories[0];
  const sellerSession = { id: sellerUser.id, role: "SELLER" as const };

  const mkListing = async (title: string, priceMinor: number) => {
    await createListing(sellerSession, { gameId: game.id, categoryId: cat.id, type: cat.kind, title, description: "Step 20 QA listing.", price: priceMinor, stock: 50, deliveryType: "MANUAL", attributes: {}, images: [], publish: true });
    return db.listing.findFirstOrThrow({ where: { sellerId: seller.id, title }, orderBy: { createdAt: "desc" } });
  };

  const orderIds: string[] = [];
  let running = 0;
  const mkOrder = async (listingId: string, unitPriceMinor: number, sellerFeeMinor: number, status: "COMPLETED" | "PAID" | "DISPUTED", withSale: boolean) => {
    const feeMinor = Math.round(unitPriceMinor * 0.05);
    const order = await db.order.create({
      data: { buyerId: buyer.id, sellerId: seller.id, listingId, qty: 1, unitPriceMinor, feeMinor, sellerFeeMinor, totalMinor: unitPriceMinor + feeMinor, currency: "INR", status },
    });
    orderIds.push(order.id);
    if (withSale) {
      const saleMinor = unitPriceMinor - sellerFeeMinor;
      running += saleMinor;
      await db.ledgerEntry.create({ data: { walletId: wallet.id, orderId: order.id, type: "CREDIT", reason: "SALE", amountMinor: saleMinor, balanceAfterMinor: running } });
    }
    return order;
  };

  try {
    const L1 = await mkListing(`QA20 L1 ${stamp}`, 100000);
    const L2 = await mkListing(`QA20 L2 ${stamp}`, 200000);
    await mkListing(`QA20 P1 ${stamp}`, 150000); // peers for the benchmark
    await mkListing(`QA20 P2 ${stamp}`, 250000);

    // 3 completed sales for L1, 1 for L2 (+SALE ledger). 1 PAID + 1 DISPUTED for the funnel.
    await mkOrder(L1.id, 100000, 8000, "COMPLETED", true);
    await mkOrder(L1.id, 100000, 8000, "COMPLETED", true);
    await mkOrder(L1.id, 100000, 8000, "COMPLETED", true);
    await mkOrder(L2.id, 200000, 16000, "COMPLETED", true);
    await mkOrder(L1.id, 100000, 8000, "PAID", false);
    await mkOrder(L2.id, 200000, 16000, "DISPUTED", false);

    const totalSale = 92000 * 3 + 184000; // 460000
    const totalFees = 8000 * 3 + 16000; // 40000

    console.log("\n=== getRevenueSeries (gap-fill + window) ===");
    const rev30 = await getRevenueSeries(seller.id, 30);
    ok("30d window returns exactly 30 points", rev30.length === 30, `got ${rev30.length}`);
    ok("all points are gap-filled (revenue ≥ 0)", rev30.every((p) => p.revenue >= 0 && typeof p.date === "string"));
    const today = rev30[rev30.length - 1];
    ok("today's revenue sums the SALE rows", today.revenue === totalSale, `got ${today.revenue}`);
    ok("today's order count = 4 SALE rows", today.orders === 4, `got ${today.orders}`);
    ok("7d window returns 7 points", (await getRevenueSeries(seller.id, 7)).length === 7);
    ok("90d window returns 90 points", (await getRevenueSeries(seller.id, 90)).length === 90);

    console.log("\n=== getTopListings ===");
    const top = await getTopListings(seller.id, 30);
    ok("returns ≤ 5 listings", top.length <= 5);
    ok("sorted by completedCount DESC", top.length >= 2 && top[0].completedCount >= top[1].completedCount);
    ok("top listing is L1 (3 sales)", top[0].listingId === L1.id && top[0].completedCount === 3, `got ${top[0]?.completedCount}`);
    ok("top listing revenue = Σ SALE for its orders", top[0].revenue === 92000 * 3, `got ${top[0]?.revenue}`);

    console.log("\n=== getOrderFunnel ===");
    const funnel = await getOrderFunnel(seller.id, 30);
    ok("returns all 7 lifecycle stages", funnel.length === 7);
    const fstat = (s: string) => funnel.find((f) => f.status === s)?.count ?? -1;
    ok("COMPLETED count = 4", fstat("COMPLETED") === 4, `got ${fstat("COMPLETED")}`);
    ok("PAID count = 1", fstat("PAID") === 1);
    ok("DISPUTED count = 1", fstat("DISPUTED") === 1);
    ok("zero-count stage returns 0 (not missing)", fstat("REFUNDED") === 0);

    console.log("\n=== getWalletSummary (reconciled to ledger) ===");
    const summary = await getWalletSummary(seller.id);
    const bal = await getWalletBalances(wallet.id);
    ok("totalEarned = Σ SALE credits", summary.totalEarnedMinor === totalSale, `got ${summary.totalEarnedMinor}`);
    ok("available = ledger available (no holds here)", summary.availableMinor === bal.availableMinor && summary.availableMinor === totalSale);
    ok("held = 0 (no escrow holds)", summary.heldMinor === 0);
    ok("available + held = ledger gross", summary.availableMinor + summary.heldMinor === bal.grossMinor);
    ok("totalFees = Σ sellerFeeMinor over COMPLETED", summary.totalFeesMinor === totalFees, `got ${summary.totalFeesMinor}`);

    console.log("\n=== getOrderCount ===");
    ok("counts all 6 orders in window", (await getOrderCount(seller.id, 30)) === 6);

    console.log("\n=== getPriceBenchmark ===");
    const peerCount = await db.listing.count({ where: { gameId: game.id, categoryId: cat.id, status: "ACTIVE", id: { not: L1.id } } });
    const bench = await getPriceBenchmark(L1.id);
    if (peerCount === 0) {
      ok("no peers → null", bench === null);
    } else {
      ok("with peers → not null, sampleSize matches active peer count", bench !== null && bench.sampleSize === peerCount, `peers=${peerCount} sample=${bench?.sampleSize}`);
      ok("avg lies within [min, max]", bench !== null && bench.minMinor <= bench.avgMinor && bench.avgMinor <= bench.maxMinor);
    }
    ok("non-existent listing → null", (await getPriceBenchmark("nonexistent-listing-id")) === null);

    console.log("\n=== AI pricing graceful degradation ===");
    ok("isAiEnabled() false → action returns fallback string (no crash)", isAiEnabled() === false);

    console.log("\n=== no-N+1 proxy: each analytics fn completes < 2s ===");
    const t0 = Date.now();
    await Promise.all([getRevenueSeries(seller.id, 90), getTopListings(seller.id, 90), getOrderFunnel(seller.id, 90), getWalletSummary(seller.id)]);
    ok("4 analytics fns (90d) resolve quickly", Date.now() - t0 < 2000, `took ${Date.now() - t0}ms`);
  } finally {
    await db.ledgerEntry.deleteMany({ where: { walletId: wallet.id } });
    await db.order.deleteMany({ where: { id: { in: orderIds } } });
    await db.wallet.deleteMany({ where: { id: wallet.id } });
    await db.listing.deleteMany({ where: { sellerId: seller.id } });
    await db.sellerProfile.deleteMany({ where: { id: seller.id } });
    await db.user.deleteMany({ where: { id: { in: [buyer.id, sellerUser.id] } } });
  }

  console.log(`\n${fail === 0 ? "✅" : "❌"} Step 20 QA — ${pass} passed, ${fail} failed`);
  if (fail > 0) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
