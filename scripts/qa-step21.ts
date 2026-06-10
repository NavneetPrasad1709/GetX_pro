/**
 * Step 21 QA — Loyalty points. Drives the REAL money paths end-to-end against the dev DB:
 * signup bonus (idempotent), earn on a full buy→pay→deliver→release cycle (buyer + seller),
 * checkout redemption with server-side clamping (balance / 20% / platform-fee caps), the escrow
 * reconciliation STAYING intact when a discount is applied, refund reversal (compensating EARN),
 * derived-balance correctness, and the order-bound idempotency index. Cleans up in finally.
 * Run: npx tsx scripts/qa-step21.ts
 */
import { db } from "../src/lib/db";
import {
  LOYALTY_CONFIG,
  pointsToMinorUnits,
  buyerEarnPoints,
  sellerEarnPoints,
} from "../src/config/loyalty";
import {
  getLoyaltyBalance,
  getLoyaltyHistory,
  awardSignupBonus,
  computeRedemptionCap,
} from "../src/server/services/loyalty";
import { createListing } from "../src/server/services/listings";
import { createOrder } from "../src/server/services/orders";
import { applyPaymentEvent } from "../src/server/services/payments";
import { markDelivered, confirmReceipt, refund } from "../src/server/services/escrow";

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
  const buyer = await db.user.create({ data: { email: `qa21-b-${stamp}@test.getx.live`, name: "QA21 Buyer", emailVerified: new Date(), emailNotifications: false } });
  const sellerUser = await db.user.create({ data: { email: `qa21-s-${stamp}@test.getx.live`, name: "QA21 Seller", emailVerified: new Date(), emailNotifications: false } });
  const seller = await db.sellerProfile.create({ data: { userId: sellerUser.id, displayName: "QA21 Store", kycStatus: "APPROVED" } });
  const game = await db.game.findFirstOrThrow({ include: { categories: true } });
  const cat = game.categories.find((c) => c.kind === "ACCOUNT") ?? game.categories[0];

  const orderIds: string[] = [];
  const mkListing = async (slug: string, priceMinor: number) => {
    await createListing({ id: sellerUser.id, role: "SELLER" }, { gameId: game.id, categoryId: cat.id, type: cat.kind, title: `QA21 ${slug}`, description: "Loyalty QA listing.", price: priceMinor, stock: 50, deliveryType: "MANUAL", attributes: {}, images: [], publish: true });
    const l = await db.listing.findFirstOrThrow({ where: { sellerId: seller.id }, orderBy: { createdAt: "desc" } });
    await db.listing.update({ where: { id: l.id }, data: { slug } });
    return { ...l, slug }; // return the UPDATED slug, not the auto-generated one
  };
  const payAndDeliver = async (orderId: string, amountMinor: number) => {
    const ref = `qa21-ref-${orderId}`;
    await db.payment.create({ data: { orderId, provider: "RAZORPAY", providerRef: ref, amountMinor, currency: "INR", status: "PENDING" } });
    await applyPaymentEvent({ provider: "RAZORPAY", providerEventId: `qa21-evt-${orderId}`, providerRef: ref, kind: "CONFIRMED", amountMinor, currency: "INR", raw: { qa: true } });
  };

  try {
    console.log("\n=== signup bonus (idempotent) ===");
    await awardSignupBonus(buyer.id);
    ok("new user gets 50 signup points", (await getLoyaltyBalance(buyer.id)) === 50);
    await awardSignupBonus(buyer.id);
    ok("signup bonus is idempotent (still 50, no double)", (await getLoyaltyBalance(buyer.id)) === 50);

    console.log("\n=== config helpers ===");
    ok("pointsToMinorUnits: 100 pts = ₹10 (1000 paise)", pointsToMinorUnits(100) === 1000);
    ok("buyerEarnPoints: ₹1000 subtotal → 100 pts", buyerEarnPoints(100000) === 100);
    ok("sellerEarnPoints: ₹920 net → 46 pts", sellerEarnPoints(92000) === 46);
    ok("computeRedemptionCap: ₹1000 → 2000 pts (20%)", computeRedemptionCap(100000) === 2000);

    // Top up the buyer so they have points to redeem (manual EARN, no order).
    await db.loyaltyPoint.create({ data: { userId: buyer.id, amount: 2000, type: "EARN", reason: "PURCHASE", orderId: null } });
    ok("buyer balance after top-up = 2050", (await getLoyaltyBalance(buyer.id)) === 2050);

    console.log("\n=== checkout redemption (server clamps to platform-fee cap) ===");
    const L1 = await mkListing(`qa21-redeem-${stamp}`, 100000); // ₹1000 → fee ₹50 (5000 paise)
    const o1 = await createOrder({ id: buyer.id, role: "BUYER" }, { listingSlug: L1.slug, qty: 1, redeemPoints: 99999 });
    orderIds.push(o1.id);
    // 99999 requested → clamp = min(20%cap 2000, fee-cap 500, balance 2050) = 500 pts (= ₹50 = the whole fee)
    ok("redeemed clamped to platform-fee cap (500 pts)", o1.loyaltyPointsRedeemed === 500, `got ${o1.loyaltyPointsRedeemed}`);
    ok("discount applied to total (₹1050 → ₹1000)", o1.totalMinor === 100000, `got ${o1.totalMinor}`);
    ok("discount came out of the platform fee (fee → 0)", o1.feeMinor === 0, `got ${o1.feeMinor}`);
    ok("balance reduced by redeemed points (2050 → 1550)", (await getLoyaltyBalance(buyer.id)) === 1550);

    console.log("\n=== escrow reconciliation stays intact + earn on completion ===");
    await payAndDeliver(o1.id, o1.totalMinor);
    await markDelivered(sellerUser.id, o1.id, "qa21 delivery payload");
    let threw = false;
    try {
      await confirmReceipt(buyer.id, o1.id); // releases — would THROW if reconciliation broke
    } catch (e) {
      threw = true;
      console.error("    release error:", e instanceof Error ? e.message : e);
    }
    ok("release did NOT throw (discount reconciles cleanly)", !threw);
    const o1after = await db.order.findUniqueOrThrow({ where: { id: o1.id }, select: { status: true, sellerFeeMinor: true } });
    ok("order is COMPLETED", o1after.status === "COMPLETED");
    // Buyer earned PURCHASE on subtotal (100 pts): 1550 + 100 = 1650.
    ok("buyer earned 100 PURCHASE pts on completion (→ 1650)", (await getLoyaltyBalance(buyer.id)) === 1650, `got ${await getLoyaltyBalance(buyer.id)}`);
    const saleMinor = 100000 - o1after.sellerFeeMinor;
    ok("seller earned SALE pts on net take", (await getLoyaltyBalance(sellerUser.id)) === sellerEarnPoints(saleMinor), `expected ${sellerEarnPoints(saleMinor)}`);
    // Seller wallet SALE credit must equal full saleMinor (seller never loses to the discount).
    const sellerWallet = await db.wallet.findUniqueOrThrow({ where: { sellerProfileId: seller.id }, select: { id: true } });
    const saleLedger = await db.ledgerEntry.aggregate({ where: { walletId: sellerWallet.id, reason: "SALE", type: "CREDIT" }, _sum: { amountMinor: true } });
    ok("seller SALE credit = full saleMinor (discount was platform-funded)", (saleLedger._sum.amountMinor ?? 0) === saleMinor, `got ${saleLedger._sum.amountMinor}`);

    console.log("\n=== refund reversal restores redeemed points ===");
    const balBeforeRefundFlow = await getLoyaltyBalance(buyer.id); // 1650
    const L2 = await mkListing(`qa21-refund-${stamp}`, 100000);
    const o2 = await createOrder({ id: buyer.id, role: "BUYER" }, { listingSlug: L2.slug, qty: 1, redeemPoints: 300 });
    orderIds.push(o2.id);
    ok("o2 redeemed 300 pts", o2.loyaltyPointsRedeemed === 300);
    ok("balance after o2 redemption = prev − 300", (await getLoyaltyBalance(buyer.id)) === balBeforeRefundFlow - 300);
    await payAndDeliver(o2.id, o2.totalMinor);
    const refundRes = await refund(o2.id, "qa21 refund test");
    ok("refund succeeded", refundRes === "refunded");
    ok("redeemed points fully restored after refund", (await getLoyaltyBalance(buyer.id)) === balBeforeRefundFlow, `got ${await getLoyaltyBalance(buyer.id)}`);

    console.log("\n=== idempotency + history ===");
    // A second PURCHASE_REFUND for the same order must be a no-op (unique index + skipDuplicates).
    const beforeDup = await getLoyaltyBalance(buyer.id);
    await db.loyaltyPoint.createMany({ data: [{ userId: buyer.id, amount: 300, type: "EARN", reason: "PURCHASE_REFUND", orderId: o2.id }], skipDuplicates: true });
    ok("duplicate order-bound EARN is skipped (no double-credit)", (await getLoyaltyBalance(buyer.id)) === beforeDup);
    const history = await getLoyaltyHistory(buyer.id, 100);
    ok("history is newest-first", history.length >= 2 && history[0].createdAt >= history[1].createdAt);
    ok("config is the single source of truth", LOYALTY_CONFIG.SIGNUP_BONUS_POINTS === 50);
  } finally {
    const allOrderIds = (await db.order.findMany({ where: { sellerId: seller.id }, select: { id: true } })).map((o) => o.id);
    await db.loyaltyPoint.deleteMany({ where: { OR: [{ userId: buyer.id }, { userId: sellerUser.id }] } });
    const wal = await db.wallet.findUnique({ where: { sellerProfileId: seller.id }, select: { id: true } });
    if (wal) await db.ledgerEntry.deleteMany({ where: { walletId: wal.id } });
    await db.payment.deleteMany({ where: { orderId: { in: allOrderIds } } });
    await db.processedWebhook.deleteMany({ where: { providerEventId: { in: allOrderIds.map((id) => `qa21-evt-${id}`) } } });
    await db.orderDelivery.deleteMany({ where: { orderId: { in: allOrderIds } } });
    await db.order.deleteMany({ where: { id: { in: allOrderIds } } });
    if (wal) await db.wallet.deleteMany({ where: { id: wal.id } });
    await db.listing.deleteMany({ where: { sellerId: seller.id } });
    await db.sellerProfile.deleteMany({ where: { id: seller.id } });
    await db.user.deleteMany({ where: { id: { in: [buyer.id, sellerUser.id] } } });
  }

  console.log(`\n${fail === 0 ? "✅" : "❌"} Step 21 QA — ${pass} passed, ${fail} failed`);
  if (fail > 0) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
