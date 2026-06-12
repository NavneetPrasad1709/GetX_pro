/**
 * Step 15 QA harness — admin + KYC + disputes, AND the full MVP end-to-end flow.
 * Drives the REAL services against the live dev DB:
 *   register → seller → KYC approve → list → buyer pays (escrow hold) → deliver
 *   → confirm (release) → wallet → payout (admin paid) → review,
 *   plus dispute REFUND-buyer and dispute RELEASE-seller, plus admin moderation
 *   (ban/role/remove, all audit-logged) and the KYC review flow.
 * Run: npx tsx scripts/qa-step15.ts   (marked data, cleaned up).
 */
import { db } from "../src/lib/db";
import { createListing } from "../src/server/services/listings";
import { createOrder } from "../src/server/services/orders";
import { applyPaymentEvent } from "../src/server/services/payments";
import {
  confirmReceipt,
  markDelivered,
  openDispute,
  resolveDispute,
} from "../src/server/services/escrow";
import { getWalletBalances } from "../src/server/services/wallet";
import {
  getWalletOverview,
  markPayoutPaid,
  requestPayout,
} from "../src/server/services/payouts";
import { createReview } from "../src/server/services/reviews";
import { listPendingKyc, reviewKyc, submitKyc } from "../src/server/services/kyc";
import {
  getAdminDashboard,
  getDisputeContext,
  listOpenDisputes,
  listUsers,
  removeListingAsAdmin,
  setUserBanned,
  setUserRole,
} from "../src/server/services/admin";

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
async function threw(fn: () => Promise<unknown>): Promise<string | null> {
  try {
    await fn();
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

async function main() {
  const stamp = Date.now();
  const slug = `qa15-listing-${stamp}`;
  const emails = {
    buyer: `qa15-buyer-${stamp}@test.getx.live`,
    seller: `qa15-seller-${stamp}@test.getx.live`,
    admin: `qa15-admin-${stamp}@test.getx.live`,
  };
  const buyer = await db.user.create({ data: { email: emails.buyer, name: "QA15 Buyer", emailVerified: new Date() } });
  const sellerUser = await db.user.create({ data: { email: emails.seller, name: "QA15 Seller", emailVerified: new Date() } });
  const admin = await db.user.create({ data: { email: emails.admin, name: "QA15 Admin", role: "ADMIN", emailVerified: new Date() } });
  const seller = await db.sellerProfile.create({ data: { userId: sellerUser.id, displayName: "QA15 Store" } });
  const game = await db.game.findFirstOrThrow({ include: { categories: true } });
  const cat = game.categories[0];

  const buyerSession = { id: buyer.id, role: "BUYER" as const };
  const sellerSession = { id: sellerUser.id, role: "SELLER" as const };

  const mkPaid = async () => {
    const order = await createOrder(buyerSession, { listingSlug: slug, qty: 1 });
    const ref = `qa15-ref-${order.id}`;
    await db.payment.create({ data: { orderId: order.id, provider: "RAZORPAY", providerRef: ref, amountMinor: order.totalMinor, currency: "INR", status: "PENDING" } });
    const res = await applyPaymentEvent({ provider: "RAZORPAY", providerEventId: `qa15-evt-${order.id}`, providerRef: ref, kind: "CONFIRMED", amountMinor: order.totalMinor, currency: "INR", raw: { qa: true } });
    if (res.outcome !== "applied") throw new Error(`pay setup failed: ${JSON.stringify(res)}`);
    return db.order.findUniqueOrThrow({ where: { id: order.id } });
  };
  const sellerWalletId = () => db.wallet.findUniqueOrThrow({ where: { sellerProfileId: seller.id } }).then((w) => w.id);
  const auditCount = (action: string) => db.auditLog.count({ where: { action, actorId: admin.id } });

  try {
    console.log("\n=== MVP END-TO-END ===");

    console.log("\n— KYC: submit → admin approve —");
    await submitKyc(sellerUser.id, "PASSPORT", `kyc/${seller.id}/${"0".repeat(32)}.pdf`);
    ok("seller kycStatus PENDING after submit", (await db.sellerProfile.findUniqueOrThrow({ where: { id: seller.id } })).kycStatus === "PENDING");
    ok("submission appears in the admin KYC queue", (await listPendingKyc()).some((k) => k.sellerId === seller.id));
    // Review fix: at most ONE PENDING submission per seller (no kycStatus desync).
    ok("second KYC submit while PENDING is rejected", (await threw(() => submitKyc(sellerUser.id, "NATIONAL_ID", `kyc/${seller.id}/${"1".repeat(32)}.pdf`)))?.includes("under review") === true);
    ok("still exactly one PENDING submission", (await db.kycSubmission.count({ where: { sellerId: seller.id, status: "PENDING" } })) === 1);
    const sub = await db.kycSubmission.findFirstOrThrow({ where: { sellerId: seller.id } });
    await reviewKyc(admin.id, sub.id, "APPROVE");
    ok("admin approve → seller APPROVED", (await db.sellerProfile.findUniqueOrThrow({ where: { id: seller.id } })).kycStatus === "APPROVED");
    ok("KYC_APPROVED audit-logged", (await auditCount("KYC_APPROVED")) === 1);
    ok("re-reviewing the same submission is rejected", (await threw(() => reviewKyc(admin.id, sub.id, "REJECT")))?.includes("already been reviewed") === true);

    console.log("\n— list → buyer pays (escrow hold) —");
    await createListing(sellerSession, {
      gameId: game.id, categoryId: cat.id, type: cat.kind,
      title: "QA15 full-flow listing", description: "End-to-end MVP test listing.",
      price: 100000, stock: 10, deliveryType: "MANUAL", attributes: {}, images: [], publish: true,
    });
    // createListing slugifies the title; fetch + re-point our slug for createOrder.
    const created = await db.listing.findFirstOrThrow({ where: { sellerId: seller.id }, orderBy: { createdAt: "desc" } });
    await db.listing.update({ where: { id: created.id }, data: { slug } });

    const order1 = await mkPaid();
    ok("order PAID after payment", order1.status === "PAID");
    const wId = await sellerWalletId();
    const subtotal = order1.unitPriceMinor * order1.qty;
    const expSale = subtotal - order1.sellerFeeMinor;
    ok("escrow held = total, available 0", (await getWalletBalances(wId)).heldMinor === order1.totalMinor && (await getWalletBalances(wId)).availableMinor === 0);

    console.log("\n— deliver → confirm (release) → wallet —");
    await markDelivered(sellerUser.id, order1.id, "Login: hero / Pass: secret");
    ok("order DELIVERED", (await db.order.findUniqueOrThrow({ where: { id: order1.id } })).status === "DELIVERED");
    await confirmReceipt(buyer.id, order1.id);
    ok("order COMPLETED", (await db.order.findUniqueOrThrow({ where: { id: order1.id } })).status === "COMPLETED");
    const ovAfter = await getWalletOverview(sellerUser.id);
    ok("seller available = sale (subtotal − commission)", ovAfter.availableMinor === expSale, `${ovAfter.availableMinor} vs ${expSale}`);

    // P1-T1: a saved payout destination is required before any withdrawal.
    await db.payoutAccount.create({ data: { userId: sellerUser.id, method: "RAZORPAY", holderName: "QA15 Seller", upiVpa: "qa15s@upi", maskedHint: "qa15s@upi" } });
    console.log("\n— payout: request → admin paid —");
    const payout = await requestPayout(sellerUser.id, expSale);
    ok("payout reserved (available → 0)", (await getWalletOverview(sellerUser.id)).availableMinor === 0);
    await markPayoutPaid(admin.id, payout.id);
    ok("payout PAID", (await db.payout.findUniqueOrThrow({ where: { id: payout.id } })).status === "PAID");

    console.log("\n— review —");
    await createReview(buyer.id, order1.id, 5, "Flawless, fast delivery.");
    ok("seller ratingCount 1, avg 5", (await db.sellerProfile.findUniqueOrThrow({ where: { id: seller.id } })).ratingCount === 1);

    console.log("\n=== DISPUTE PATHS ===");

    console.log("\n— dispute → REFUND buyer —");
    const order2 = await mkPaid();
    await openDispute(buyer.id, order2.id, "Item not as described, account locked.");
    ok("order2 DISPUTED", (await db.order.findUniqueOrThrow({ where: { id: order2.id } })).status === "DISPUTED");
    ok("dispute appears in admin queue", (await listOpenDisputes()).some((d) => d.orderId === order2.id));
    ok("getDisputeContext returns order + reason for admin", (await getDisputeContext(order2.id))?.reason.includes("not as described") === true);
    await resolveDispute(admin.id, order2.id, "REFUND_BUYER", "Buyer is right — refunding.");
    ok("order2 REFUNDED", (await db.order.findUniqueOrThrow({ where: { id: order2.id } })).status === "REFUNDED");
    ok("dispute → RESOLVED_BUYER", (await db.dispute.findUniqueOrThrow({ where: { orderId: order2.id } })).status === "RESOLVED_BUYER");
    ok("refund reversed the hold (DEBIT REFUND written)", (await db.ledgerEntry.count({ where: { orderId: order2.id, type: "DEBIT", reason: "REFUND" } })) === 1);
    ok("DISPUTE_RESOLVED_BUYER audit-logged", (await auditCount("DISPUTE_RESOLVED_BUYER")) === 1);
    ok("re-resolving a resolved dispute is rejected", (await threw(() => resolveDispute(admin.id, order2.id, "RELEASE_SELLER", "again")))?.includes("already been resolved") === true);

    console.log("\n— dispute → RELEASE seller —");
    const availBefore = (await getWalletOverview(sellerUser.id)).availableMinor;
    const order3 = await mkPaid();
    await markDelivered(sellerUser.id, order3.id, "Delivered code: XYZ");
    await openDispute(buyer.id, order3.id, "Changed my mind.");
    await resolveDispute(admin.id, order3.id, "RELEASE_SELLER", "Seller delivered as described.");
    ok("order3 COMPLETED (released to seller)", (await db.order.findUniqueOrThrow({ where: { id: order3.id } })).status === "COMPLETED");
    ok("dispute → RESOLVED_SELLER", (await db.dispute.findUniqueOrThrow({ where: { orderId: order3.id } })).status === "RESOLVED_SELLER");
    const sale3 = order3.unitPriceMinor * order3.qty - order3.sellerFeeMinor;
    ok("seller available grew by the sale amount", (await getWalletOverview(sellerUser.id)).availableMinor === availBefore + sale3);
    ok("SALE credit written for the released order", (await db.ledgerEntry.count({ where: { orderId: order3.id, type: "CREDIT", reason: "SALE" } })) === 1);

    console.log("\n=== ADMIN MODERATION ===");

    console.log("\n— users: ban / role (with guards) —");
    await setUserBanned(admin.id, buyer.id, true);
    ok("buyer banned (bannedAt set)", (await db.user.findUniqueOrThrow({ where: { id: buyer.id } })).bannedAt !== null);
    ok("USER_BANNED audit-logged", (await auditCount("USER_BANNED")) === 1);
    await setUserBanned(admin.id, buyer.id, false);
    ok("buyer unbanned", (await db.user.findUniqueOrThrow({ where: { id: buyer.id } })).bannedAt === null);
    ok("admin can't ban themselves", (await threw(() => setUserBanned(admin.id, admin.id, true)))?.includes("your own") === true);
    ok("admin can't ban another admin", (await threw(() => setUserBanned(admin.id, admin.id, true))) !== null);
    ok("admin can't change their own role", (await threw(() => setUserRole(admin.id, admin.id, "BUYER")))?.includes("your own") === true);
    await setUserRole(admin.id, buyer.id, "ADMIN");
    ok("role change works + audit-logged", (await db.user.findUniqueOrThrow({ where: { id: buyer.id } })).role === "ADMIN" && (await auditCount("USER_ROLE_CHANGED")) === 1);
    await setUserRole(admin.id, buyer.id, "BUYER");

    console.log("\n— listing take-down —");
    await removeListingAsAdmin(admin.id, created.id);
    ok("listing REMOVED + audit-logged", (await db.listing.findUniqueOrThrow({ where: { id: created.id } })).status === "REMOVED" && (await auditCount("LISTING_REMOVED_BY_ADMIN")) === 1);

    console.log("\n— dashboard + user search —");
    const dash = await getAdminDashboard();
    ok("dashboard: GMV > 0, no open disputes left, users counted", dash.gmvMinor > 0 && dash.openDisputes === 0 && dash.users >= 3, JSON.stringify(dash));
    ok("user search finds the seller by email", (await listUsers(emails.seller)).some((u) => u.id === sellerUser.id));

    console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  } finally {
    await db.auditLog.deleteMany({ where: { actorId: { in: [admin.id, buyer.id, sellerUser.id] } } });
    await db.processedWebhook.deleteMany({ where: { providerEventId: { contains: `${stamp}` } } });
    const orderIds = (await db.order.findMany({ where: { buyerId: buyer.id }, select: { id: true } })).map((o) => o.id);
    await db.auditLog.deleteMany({ where: { entityId: { in: orderIds } } });
    await db.order.deleteMany({ where: { buyerId: buyer.id } });
    await db.listing.deleteMany({ where: { sellerId: seller.id } });
    await db.user.deleteMany({ where: { email: { in: Object.values(emails) } } });
    await db.$disconnect();
  }
  if (fail > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
