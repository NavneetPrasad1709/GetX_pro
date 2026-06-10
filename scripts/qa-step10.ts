/**
 * Step 10 QA harness — escrow, delivery, buyer protection, auto-release.
 * Exercises the REAL code paths against the live dev DB: brings orders to PAID
 * through the actual payment pipeline (createOrder → applyPaymentEvent), then
 * drives markDelivered / confirmReceipt / openDispute / refund / runAutoRelease
 * and the REAL cron ROUTE handler (authorized + forged). Asserts the ledger
 * reconciles and that every money path is idempotent (never double-pays).
 * Run: npx tsx scripts/qa-step10.ts   (creates marked data, cleans up after).
 */
import { db } from "../src/lib/db";
import { createOrder, getOrder } from "../src/server/services/orders";
import { applyPaymentEvent } from "../src/server/services/payments";
import {
  confirmReceipt,
  markDelivered,
  openDispute,
  PLATFORM_WALLET_ID,
  refund,
  runAutoRelease,
} from "../src/server/services/escrow";
import { getWalletBalances } from "../src/server/services/wallet";
import { GET as autoReleaseCron } from "../src/app/api/cron/auto-release/route";

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

const CRON_SECRET = "qa10-cron-secret";

async function expectThrow(fn: () => Promise<unknown>): Promise<string | null> {
  try {
    await fn();
    return null;
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
}

async function main() {
  const stamp = Date.now();
  process.env.CRON_SECRET = CRON_SECRET;

  const emails = {
    buyer: `qa10-buyer-${stamp}@test.getx.live`,
    seller: `qa10-seller-${stamp}@test.getx.live`,
    stranger: `qa10-stranger-${stamp}@test.getx.live`,
  };
  const buyer = await db.user.create({ data: { email: emails.buyer, emailVerified: new Date() } });
  const stranger = await db.user.create({ data: { email: emails.stranger, emailVerified: new Date() } });
  const sellerUser = await db.user.create({ data: { email: emails.seller, emailVerified: new Date() } });
  const seller = await db.sellerProfile.create({
    data: { userId: sellerUser.id, displayName: "QA10 Seller" },
  });
  const game = await db.game.findFirstOrThrow({ include: { categories: true } });
  const cat = game.categories[0];

  const buyerSession = { id: buyer.id, role: "BUYER" as const };
  const orderIds: string[] = [];

  const mkListing = (slug: string, stock: number) =>
    db.listing.create({
      data: {
        sellerId: seller.id,
        gameId: game.id,
        categoryId: cat.id,
        type: cat.kind,
        title: `QA10 ${slug}`,
        slug,
        description: "QA10 listing",
        priceMinor: 100000,
        currency: "INR",
        stock,
        deliveryType: "MANUAL",
        status: "ACTIVE",
        attributes: {},
      },
    });

  /** Create an order and drive it to PAID via the real payment pipeline. */
  const mkPaidOrder = async (slug: string, stock = 2, qty = 1) => {
    const listing = await mkListing(slug, stock);
    const order = await createOrder(buyerSession, { listingSlug: slug, qty });
    orderIds.push(order.id);
    const ref = `qa10-ref-${slug}`;
    await db.payment.create({
      data: {
        orderId: order.id,
        provider: "RAZORPAY",
        providerRef: ref,
        amountMinor: order.totalMinor,
        currency: "INR",
        status: "PENDING",
      },
    });
    const res = await applyPaymentEvent({
      provider: "RAZORPAY",
      providerEventId: `qa10-evt-${slug}`,
      providerRef: ref,
      kind: "CONFIRMED",
      amountMinor: order.totalMinor,
      currency: "INR",
      raw: { qa: true },
    });
    if (res.outcome !== "applied") throw new Error(`setup failed: ${JSON.stringify(res)}`);
    return { listing, order: await db.order.findUniqueOrThrow({ where: { id: order.id } }) };
  };

  const sellerWallet = () =>
    db.wallet.findUniqueOrThrow({ where: { sellerProfileId: seller.id } });
  const orderLedger = (orderId: string, walletId?: string) =>
    db.ledgerEntry.findMany({
      where: { orderId, ...(walletId ? { walletId } : {}) },
      orderBy: { createdAt: "asc" },
    });

  try {
    // ------------------------------------------------------------------
    console.log("\n— happy path: PAID → deliver → confirm → COMPLETED + paid out —");
    const a = await mkPaidOrder(`qa10-a-${stamp}`);
    const subtotal = a.order.unitPriceMinor * a.order.qty;
    const expCommission = a.order.sellerFeeMinor;
    const expPlatformFee = a.order.feeMinor;
    const expSale = subtotal - expCommission;
    ok(
      "fee snapshot reconciles to total (sale + platformFee + commission = total)",
      expSale + expPlatformFee + expCommission === a.order.totalMinor,
      `${expSale}+${expPlatformFee}+${expCommission} vs ${a.order.totalMinor}`,
    );

    const wal = await sellerWallet();
    const balPaid = await getWalletBalances(wal.id);
    ok(
      "after PAID: held = total, available = 0",
      balPaid.heldMinor === a.order.totalMinor && balPaid.availableMinor === 0,
      JSON.stringify(balPaid),
    );

    await markDelivered(sellerUser.id, a.order.id, "Login: hero@acct\nPassword: s3cr3t");
    const delivered = await db.order.findUniqueOrThrow({ where: { id: a.order.id } });
    ok(
      "markDelivered → DELIVERED + deliveredAt + autoReleaseAt set",
      delivered.status === "DELIVERED" &&
        delivered.deliveredAt !== null &&
        delivered.autoReleaseAt !== null,
      delivered.status,
    );
    ok(
      "autoReleaseAt ≈ deliveredAt + 3 days",
      delivered.autoReleaseAt!.getTime() - delivered.deliveredAt!.getTime() ===
        3 * 24 * 60 * 60 * 1000,
    );
    const deliveryRow = await db.orderDelivery.findUnique({ where: { orderId: a.order.id } });
    ok("delivery content stored", deliveryRow?.content.includes("s3cr3t") === true);

    await confirmReceipt(buyer.id, a.order.id);
    const completed = await db.order.findUniqueOrThrow({ where: { id: a.order.id } });
    ok("confirmReceipt → COMPLETED", completed.status === "COMPLETED");

    const balDone = await getWalletBalances(wal.id);
    ok(
      "after release: available = sale, held = 0",
      balDone.availableMinor === expSale && balDone.heldMinor === 0,
      JSON.stringify(balDone),
    );

    const sellerEntries = await orderLedger(a.order.id, wal.id);
    const reasons = sellerEntries.map((e) => `${e.type}:${e.reason}:${e.amountMinor}`);
    ok(
      "seller ledger = ESCROW_HOLD + ESCROW_RELEASE + SALE",
      reasons.length === 3 &&
        reasons.includes(`CREDIT:ESCROW_HOLD:${a.order.totalMinor}`) &&
        reasons.includes(`DEBIT:ESCROW_RELEASE:${a.order.totalMinor}`) &&
        reasons.includes(`CREDIT:SALE:${expSale}`),
      reasons.join(", "),
    );

    const platformEntries = await orderLedger(a.order.id, PLATFORM_WALLET_ID);
    const platSum = platformEntries.reduce((n, e) => n + e.amountMinor, 0);
    ok(
      "platform ledger = two FEE credits summing to platformFee + commission",
      platformEntries.length === 2 &&
        platformEntries.every((e) => e.type === "CREDIT" && e.reason === "FEE") &&
        platSum === expPlatformFee + expCommission,
      `${platformEntries.length} entries, sum ${platSum}`,
    );

    const sellerAfter = await db.sellerProfile.findUniqueOrThrow({ where: { id: seller.id } });
    ok("seller totalSales incremented to 1", sellerAfter.totalSales === 1);

    // ------------------------------------------------------------------
    console.log("\n— idempotency: double confirm never double-pays —");
    const dupMsg = await expectThrow(() => confirmReceipt(buyer.id, a.order.id));
    ok("second confirm rejected (already complete)", dupMsg !== null, dupMsg ?? "");
    ok(
      "seller ledger STILL 3 entries (no double release)",
      (await orderLedger(a.order.id, wal.id)).length === 3,
    );

    // ------------------------------------------------------------------
    console.log("\n— ownership + state guards —");
    const b = await mkPaidOrder(`qa10-b-${stamp}`);
    const notSeller = await expectThrow(() =>
      markDelivered(buyer.id, b.order.id, "buyer trying to deliver"),
    );
    ok("non-seller cannot deliver (Order not found)", notSeller === "Order not found.");

    // an un-paid order cannot be delivered
    await mkListing(`qa10-c-${stamp}`, 2);
    const cOrder = await createOrder(buyerSession, { listingSlug: `qa10-c-${stamp}`, qty: 1 });
    orderIds.push(cOrder.id);
    const notPaid = await expectThrow(() =>
      markDelivered(sellerUser.id, cOrder.id, "too early"),
    );
    ok("cannot deliver an AWAITING_PAYMENT order", notPaid?.includes("payment has cleared") === true, notPaid ?? "");

    await markDelivered(sellerUser.id, b.order.id, "creds-b");
    const notBuyerConfirm = await expectThrow(() => confirmReceipt(stranger.id, b.order.id));
    ok("non-buyer cannot confirm (Order not found)", notBuyerConfirm === "Order not found.");
    const notBuyerDispute = await expectThrow(() =>
      openDispute(stranger.id, b.order.id, "stranger disputing this order"),
    );
    ok("non-buyer cannot dispute (Order not found)", notBuyerDispute === "Order not found.");

    // delivery content visibility (getOrder ownership gate)
    const seenByBuyer = await getOrder(buyerSession, b.order.id);
    const seenBySeller = await getOrder({ id: sellerUser.id, role: "SELLER" }, b.order.id);
    const seenByStranger = await getOrder({ id: stranger.id, role: "BUYER" }, b.order.id);
    ok("buyer sees delivery content", seenByBuyer?.delivery?.content === "creds-b");
    ok("seller sees delivery content", seenBySeller?.delivery?.content === "creds-b");
    ok("stranger gets null (no access)", seenByStranger === null);

    // ------------------------------------------------------------------
    console.log("\n— dispute freezes release —");
    await openDispute(buyer.id, b.order.id, "Account details do not work as described.");
    const disputed = await db.order.findUniqueOrThrow({ where: { id: b.order.id } });
    ok("openDispute → DISPUTED", disputed.status === "DISPUTED");
    ok(
      "Dispute row created (OPEN)",
      (await db.dispute.findUnique({ where: { orderId: b.order.id } }))?.status === "OPEN",
    );
    const confirmDisputed = await expectThrow(() => confirmReceipt(buyer.id, b.order.id));
    ok("cannot confirm a disputed order", confirmDisputed?.includes("under dispute") === true, confirmDisputed ?? "");
    const walB = await sellerWallet();
    const balDisputed = await getWalletBalances(walB.id);
    ok(
      "disputed order's money stays HELD (not released)",
      balDisputed.heldMinor >= b.order.totalMinor,
      JSON.stringify(balDisputed),
    );

    // ------------------------------------------------------------------
    console.log("\n— refund reverses the hold —");
    const r = await mkPaidOrder(`qa10-r-${stamp}`, 1, 1); // last unit → SOLD at PAID
    const listingSoldOut = await db.listing.findUniqueOrThrow({ where: { id: r.listing.id } });
    ok("listing SOLD after last unit paid", listingSoldOut.stock === 0 && listingSoldOut.status === "SOLD");

    const refundRes = await refund(r.order.id, "Seller could not deliver.");
    ok("refund → refunded", refundRes === "refunded");
    const refunded = await db.order.findUniqueOrThrow({ where: { id: r.order.id } });
    ok("order REFUNDED", refunded.status === "REFUNDED");
    const refundLedger = await orderLedger(r.order.id);
    ok(
      "refund wrote DEBIT REFUND of the full total",
      refundLedger.some((e) => e.type === "DEBIT" && e.reason === "REFUND" && e.amountMinor === r.order.totalMinor),
      refundLedger.map((e) => `${e.type}:${e.reason}`).join(", "),
    );
    const walR = await sellerWallet();
    const balR = await getWalletBalances(walR.id);
    // available unchanged (refund only reverses a held amount), held drops by total
    ok(
      "after refund: this order's hold is cleared (held excludes it)",
      balR.heldMinor === balDisputed.heldMinor, // still only the disputed hold remains
      `held ${balR.heldMinor} vs disputed-only ${balDisputed.heldMinor}`,
    );
    const listingRestocked = await db.listing.findUniqueOrThrow({ where: { id: r.listing.id } });
    ok(
      "refund restocked + reactivated the listing",
      listingRestocked.stock === 1 && listingRestocked.status === "ACTIVE",
      `${listingRestocked.stock}/${listingRestocked.status}`,
    );
    const refundReplay = await refund(r.order.id, "again");
    ok("refund is idempotent (second call = noop)", refundReplay === "noop");

    // ------------------------------------------------------------------
    console.log("\n— auto-release sweep + double-fire safety —");
    const d = await mkPaidOrder(`qa10-d-${stamp}`);
    await markDelivered(sellerUser.id, d.order.id, "creds-d");
    // Force the deadline into the past so the sweep picks it up.
    await db.order.update({
      where: { id: d.order.id },
      data: { autoReleaseAt: new Date(stamp - 60_000) },
    });
    const sweep1 = await runAutoRelease();
    ok("sweep released ≥ 1 overdue order", sweep1.released >= 1, JSON.stringify(sweep1));
    ok(
      "the overdue order is COMPLETED",
      (await db.order.findUniqueOrThrow({ where: { id: d.order.id } })).status === "COMPLETED",
    );
    const dLedgerCount = (await orderLedger(d.order.id)).length;
    const sweep2 = await runAutoRelease();
    ok("second sweep does not re-release it", (await orderLedger(d.order.id)).length === dLedgerCount, JSON.stringify(sweep2));
    ok(
      "disputed order was NOT auto-released (still DISPUTED)",
      (await db.order.findUniqueOrThrow({ where: { id: b.order.id } })).status === "DISPUTED",
    );

    // ------------------------------------------------------------------
    console.log("\n— cron ROUTE: auth required —");
    const e = await mkPaidOrder(`qa10-e-${stamp}`);
    await markDelivered(sellerUser.id, e.order.id, "creds-e");
    await db.order.update({
      where: { id: e.order.id },
      data: { autoReleaseAt: new Date(stamp - 60_000) },
    });

    const noAuth = await autoReleaseCron(new Request("http://localhost/api/cron/auto-release"));
    ok("cron without Authorization → 401", noAuth.status === 401);
    const badAuth = await autoReleaseCron(
      new Request("http://localhost/api/cron/auto-release", {
        headers: { authorization: "Bearer wrong-secret" },
      }),
    );
    ok("cron with wrong secret → 401", badAuth.status === 401);
    ok(
      "order still DELIVERED after forged cron calls",
      (await db.order.findUniqueOrThrow({ where: { id: e.order.id } })).status === "DELIVERED",
    );

    const goodAuth = await autoReleaseCron(
      new Request("http://localhost/api/cron/auto-release", {
        headers: { authorization: `Bearer ${CRON_SECRET}` },
      }),
    );
    ok("cron with correct secret → 200", goodAuth.status === 200);
    ok(
      "authorized cron released the overdue order",
      (await db.order.findUniqueOrThrow({ where: { id: e.order.id } })).status === "COMPLETED",
    );

    console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  } finally {
    // Platform-wallet FEE rows for our orders survive order deletion (orderId is
    // SetNull, wallet persists) — delete them FIRST, while orderId still points here.
    await db.ledgerEntry.deleteMany({
      where: { walletId: PLATFORM_WALLET_ID, orderId: { in: orderIds } },
    });
    await db.auditLog.deleteMany({ where: { entityId: { in: orderIds } } });
    await db.processedWebhook.deleteMany({
      where: { providerEventId: { contains: `${stamp}` } },
    });
    // Orders/deliveries/disputes/payments cascade with the order; seller wallet +
    // its ledger cascade with the seller profile (via the user).
    await db.order.deleteMany({ where: { buyer: { email: { in: Object.values(emails) } } } });
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
