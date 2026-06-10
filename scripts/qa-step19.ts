/**
 * Step 19 QA harness — founder analytics cockpit. Seeds ONE real completed order
 * (list → pay → deliver → confirm) so the platform wallet gets genuine FEE ledger
 * rows, then asserts every analytics aggregate's shape + arithmetic against the
 * live dev DB. Uses the raw `_analyticsImpl` functions (unstable_cache can't run
 * outside a Next request). Cleans up everything in finally.
 * Run: npx tsx scripts/qa-step19.ts
 */
import { db } from "../src/lib/db";
import { createListing } from "../src/server/services/listings";
import { createOrder } from "../src/server/services/orders";
import { applyPaymentEvent } from "../src/server/services/payments";
import { markDelivered, confirmReceipt } from "../src/server/services/escrow";
import { getSellerActivationFunnel } from "../src/server/services/analytics";
import {
  _analyticsImpl,
  getTakeRateSeries,
} from "../src/server/services/founder-analytics";

const { trendImpl, funnelImpl, trustImpl, topGamesImpl, byCategoryImpl, cohortsImpl } =
  _analyticsImpl;

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
  const slug = `qa19-listing-${stamp}`;
  const buyer = await db.user.create({ data: { email: `qa19-buyer-${stamp}@test.getx.live`, name: "QA19 Buyer", emailVerified: new Date(), emailNotifications: false } });
  const sellerUser = await db.user.create({ data: { email: `qa19-seller-${stamp}@test.getx.live`, name: "QA19 Seller", emailVerified: new Date(), emailNotifications: false } });
  const seller = await db.sellerProfile.create({ data: { userId: sellerUser.id, displayName: "QA19 Store", kycStatus: "APPROVED" } });
  const game = await db.game.findFirstOrThrow({ include: { categories: true } });
  const cat = game.categories[0];

  try {
    console.log("\n=== SETUP: one real completed order ===");
    await createListing(
      { id: sellerUser.id, role: "SELLER" },
      { gameId: game.id, categoryId: cat.id, type: cat.kind, title: "QA19 analytics listing", description: "Analytics QA listing.", price: 100000, stock: 10, deliveryType: "MANUAL", attributes: {}, images: [], publish: true },
    );
    const created = await db.listing.findFirstOrThrow({ where: { sellerId: seller.id }, orderBy: { createdAt: "desc" } });
    await db.listing.update({ where: { id: created.id }, data: { slug } });

    const order = await createOrder({ id: buyer.id, role: "BUYER" }, { listingSlug: slug, qty: 1 });
    const ref = `qa19-ref-${order.id}`;
    await db.payment.create({ data: { orderId: order.id, provider: "RAZORPAY", providerRef: ref, amountMinor: order.totalMinor, currency: "INR", status: "PENDING" } });
    const res = await applyPaymentEvent({ provider: "RAZORPAY", providerEventId: `qa19-evt-${order.id}`, providerRef: ref, kind: "CONFIRMED", amountMinor: order.totalMinor, currency: "INR", raw: { qa: true } });
    if (res.outcome !== "applied") throw new Error(`pay failed: ${JSON.stringify(res)}`);
    await markDelivered(sellerUser.id, order.id, "QA19 delivery payload");
    await confirmReceipt(buyer.id, order.id); // → COMPLETED + 2 FEE rows on platform wallet
    ok("setup: order COMPLETED", (await db.order.findUniqueOrThrow({ where: { id: order.id } })).status === "COMPLETED");
    ok("setup: 2 platform FEE ledger rows written", (await db.ledgerEntry.count({ where: { orderId: order.id, walletId: "platform", reason: "FEE", type: "CREDIT" } })) === 2);

    console.log("\n=== revenue + GMV trend ===");
    const t30 = await trendImpl(30);
    const t7 = await trendImpl(7);
    const t90 = await trendImpl(90);
    ok("trend(30) returns exactly 30 entries", t30.length === 30, `${t30.length}`);
    ok("trend(7) returns exactly 7 entries", t7.length === 7, `${t7.length}`);
    ok("trend(90) returns exactly 90 entries", t90.length === 90, `${t90.length}`);
    ok("trend all non-negative", t30.every((d) => d.gmvMinor >= 0 && d.revenueMinor >= 0 && d.orderCount >= 0));
    ok("trend ascending by date", t30.every((d, i) => i === 0 || d.date > t30[i - 1].date));
    const today = t30[t30.length - 1];
    ok("today's row has GMV > 0", today.gmvMinor > 0, JSON.stringify(today));
    ok("today's row has revenue > 0", today.revenueMinor > 0, JSON.stringify(today));
    ok("gap-fill: a no-order day is zero-filled", t30.slice(0, 5).every((d) => d.gmvMinor === 0 || d.orderCount > 0));

    console.log("\n=== take-rate (pure transform) ===");
    const take = getTakeRateSeries(t30);
    ok("take-rate series same length as trend", take.length === t30.length);
    ok("take-rate today = revenue/GMV*100", Math.abs(take[take.length - 1].takeRatePercent - (today.revenueMinor / today.gmvMinor) * 100) < 0.02);
    ok("take-rate 0 when GMV is 0", take.slice(0, 5).every((d, i) => t30[i].gmvMinor > 0 || d.takeRatePercent === 0));

    console.log("\n=== order funnel ===");
    const f30 = await funnelImpl(30);
    ok("funnel shape complete", typeof f30.created === "number" && typeof f30.completionRate === "number");
    ok("funnel completed >= 1 (our order)", f30.completed >= 1);
    ok("funnel paid >= completed", f30.paid >= f30.completed);
    ok("funnel rates within 0-100", [f30.disputeRate, f30.refundRate, f30.completionRate].every((r) => r >= 0 && r <= 100));
    ok("disputeRate = 0 when no disputes", f30.disputed === 0 ? f30.disputeRate === 0 : true);

    console.log("\n=== trust health ===");
    const trust = await trustImpl();
    ok("kycVerifiedPercent within 0-100", trust.kycVerifiedPercent >= 0 && trust.kycVerifiedPercent <= 100);
    ok("avgSellerRating within 0-5", trust.avgSellerRating >= 0 && trust.avgSellerRating <= 5);
    ok("activeSellersLast30d >= 1 (our seller)", trust.activeSellersLast30d >= 1);
    ok("sellersWithFirstSale >= 1", trust.sellersWithFirstSale >= 1);

    console.log("\n=== seller funnel (reused getSellerActivationFunnel) ===");
    const sf = await getSellerActivationFunnel();
    // Robust invariants (independent of seed KYC-timestamp hygiene): a sale needs a
    // listing, and every milestone count is bounded by total registered sellers.
    ok("funnel ordering: firstSale <= firstListing; all <= registered",
      sf.firstSaleClosed <= sf.firstListingPublished &&
      sf.firstListingPublished <= sf.totalRegistered &&
      sf.kycApproved <= sf.totalRegistered &&
      sf.kycSubmitted <= sf.totalRegistered,
      JSON.stringify(sf));

    console.log("\n=== top games + by category ===");
    const games = await topGamesImpl(30);
    ok("topGames returns <= 5", games.length <= 5);
    ok("topGames all revenue >= 0", games.every((g) => g.revenueMinor >= 0));
    ok("topGames sorted by revenue desc", games.every((g, i) => i === 0 || g.revenueMinor <= games[i - 1].revenueMinor));
    ok("our game appears with revenue > 0", games.some((g) => g.gameId === game.id && g.revenueMinor > 0), JSON.stringify(games));

    const cats = await byCategoryImpl(30);
    const shareSum = cats.reduce((s, c) => s + c.sharePercent, 0);
    ok("category shares sum to ~100 (or 0 when empty)", cats.length === 0 || Math.abs(shareSum - 100) < 0.6, `${shareSum}`);
    ok("our category kind present with revenue", cats.some((c) => c.kind === cat.kind && c.revenueMinor > 0), JSON.stringify(cats));

    console.log("\n=== cohorts ===");
    const cohorts = await cohortsImpl(6);
    ok("cohorts returns <= 6 entries", cohorts.length <= 6);
    ok("cohorts activationRate <= 100, never NaN", cohorts.every((m) => m.activationRate <= 100 && !Number.isNaN(m.activationRate)));
    ok("cohorts firstSale <= newSellers", cohorts.every((m) => m.firstSaleInMonth <= m.newSellers));

    console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  } finally {
    const userIds = [buyer.id, sellerUser.id];
    const orderIds = (await db.order.findMany({ where: { buyerId: buyer.id }, select: { id: true } })).map((o) => o.id);
    await db.notification.deleteMany({ where: { userId: { in: userIds } } });
    await db.auditLog.deleteMany({ where: { OR: [{ entityId: { in: orderIds } }, { actorId: { in: userIds } }] } });
    await db.processedWebhook.deleteMany({ where: { providerEventId: { contains: `${stamp}` } } });
    await db.ledgerEntry.deleteMany({ where: { orderId: { in: orderIds } } }); // platform + seller rows for our order
    await db.payment.deleteMany({ where: { orderId: { in: orderIds } } });
    await db.order.deleteMany({ where: { buyerId: buyer.id } });
    await db.wallet.deleteMany({ where: { sellerProfileId: seller.id } });
    await db.fraudFlag.deleteMany({ where: { targetId: { in: [...userIds, seller.id, ...orderIds] } } });
    await db.listing.deleteMany({ where: { sellerId: seller.id } });
    await db.sellerProfile.deleteMany({ where: { id: seller.id } });
    await db.user.deleteMany({ where: { id: { in: userIds } } });
    await db.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
