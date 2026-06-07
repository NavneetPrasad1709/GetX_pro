/**
 * Step 08 QA harness — exercises the ORDER service directly: server-side money
 * recompute, idempotent creation, state machine, ownership, edge cases.
 * Run: npx tsx scripts/qa-step08.ts   (creates marked data, cleans up after).
 */
import { db } from "../src/lib/db";
import {
  createOrder,
  transitionOrder,
  getOrder,
  getBuyerOrders,
  canTransition,
  OrderServiceError,
} from "../src/server/services/orders";
import { computeBuyerFee, computeSellerCommissionMinor } from "../src/lib/fees";

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
async function expectError(name: string, fn: () => Promise<unknown>) {
  try {
    await fn();
    ok(name, false, "(no error thrown)");
  } catch (err) {
    ok(name, err instanceof OrderServiceError, `(got ${(err as Error).name})`);
  }
}

async function main() {
  const stamp = Date.now();
  const emails = {
    buyer: `qa08-buyer-${stamp}@test.getx.live`,
    seller: `qa08-seller-${stamp}@test.getx.live`,
    other: `qa08-other-${stamp}@test.getx.live`,
  };

  const buyer = await db.user.create({ data: { email: emails.buyer, emailVerified: new Date() } });
  const other = await db.user.create({ data: { email: emails.other, emailVerified: new Date() } });
  const sellerUser = await db.user.create({ data: { email: emails.seller, emailVerified: new Date() } });
  const seller = await db.sellerProfile.create({
    data: { userId: sellerUser.id, displayName: "QA08 Seller", trustScore: 80 },
  });

  const games = await db.game.findMany({ include: { categories: true } });
  const byKind = (kind: string) => {
    for (const g of games) {
      const c = g.categories.find((c) => c.kind === kind);
      if (c) return { gameId: g.id, categoryId: c.id };
    }
    throw new Error(`no category of kind ${kind}`);
  };
  const acct = byKind("ACCOUNT");
  const boost = byKind("BOOSTING");

  const mkListing = (slug: string, opts: Partial<{ price: number; stock: number; status: "ACTIVE" | "PAUSED"; kind: "ACCOUNT" | "BOOSTING" }>) => {
    const t = opts.kind ?? "ACCOUNT";
    const cat = t === "BOOSTING" ? boost : acct;
    return db.listing.create({
      data: {
        sellerId: seller.id,
        gameId: cat.gameId,
        categoryId: cat.categoryId,
        type: t,
        title: `QA08 ${slug}`,
        slug,
        description: "QA08 listing",
        priceMinor: opts.price ?? 100000,
        currency: "INR",
        stock: opts.stock ?? 2,
        deliveryType: "MANUAL",
        status: opts.status ?? "ACTIVE",
        attributes: {},
      },
    });
  };

  const active = await mkListing(`qa08-active-${stamp}`, { price: 100000, stock: 2 });
  const boostL = await mkListing(`qa08-boost-${stamp}`, { price: 100000, stock: 5, kind: "BOOSTING" });
  const paused = await mkListing(`qa08-paused-${stamp}`, { status: "PAUSED" });
  const soldOut = await mkListing(`qa08-soldout-${stamp}`, { stock: 0 });
  const txTestL = await mkListing(`qa08-tx-${stamp}`, { stock: 9 });

  const buyerSession = { id: buyer.id, role: "BUYER" as const };
  const sellerSession = { id: sellerUser.id, role: "SELLER" as const };
  const otherSession = { id: other.id, role: "BUYER" as const };

  try {
    console.log("\n— fee math (snapshot) —");
    ok("buyer fee: ₹1000 → fee ₹50, total ₹1050", (() => {
      const f = computeBuyerFee(100000, 1);
      return f.platformFeeMinor === 5000 && f.totalMinor === 105000;
    })());
    ok("seller commission ACCOUNT 8% of ₹1000 = ₹80", computeSellerCommissionMinor(100000, "ACCOUNT") === 8000);
    ok("seller commission BOOSTING 6% of ₹1000 = ₹60", computeSellerCommissionMinor(100000, "BOOSTING") === 6000);

    console.log("\n— create order (server recomputes money) —");
    const o1 = await createOrder(buyerSession, { listingSlug: active.slug, qty: 1 });
    ok(
      "order created AWAITING_PAYMENT with server-computed money",
      o1.status === "AWAITING_PAYMENT" &&
        o1.unitPriceMinor === 100000 &&
        o1.feeMinor === 5000 &&
        o1.totalMinor === 105000 &&
        o1.sellerFeeMinor === 8000,
      JSON.stringify({ status: o1.status, fee: o1.feeMinor, total: o1.totalMinor, sellerFee: o1.sellerFeeMinor }),
    );
    ok("order links buyer + seller + listing", o1.buyerId === buyer.id && o1.sellerId === seller.id && o1.listingId === active.id);

    const boostOrder = await createOrder(buyerSession, { listingSlug: boostL.slug, qty: 1 });
    ok("BOOSTING order snapshots 6% seller commission", boostOrder.sellerFeeMinor === 6000, `(${boostOrder.sellerFeeMinor})`);

    console.log("\n— idempotency (no double order) —");
    const o1b = await createOrder(buyerSession, { listingSlug: active.slug, qty: 1 });
    ok("double create returns the SAME open order", o1b.id === o1.id);
    const o1c = await createOrder(buyerSession, { listingSlug: active.slug, qty: 2 });
    ok(
      "re-checkout with new qty re-prices the SAME order (not a duplicate)",
      o1c.id === o1.id && o1c.qty === 2 && o1c.totalMinor === 210000 && o1c.sellerFeeMinor === 16000,
      JSON.stringify({ id: o1c.id === o1.id, qty: o1c.qty, total: o1c.totalMinor }),
    );
    const buyerOrderCount = (await getBuyerOrders(buyer.id)).filter((o) => o.listingSlug === active.slug).length;
    ok("exactly ONE open order for buyer+listing", buyerOrderCount === 1, `(count=${buyerOrderCount})`);

    console.log("\n— edge cases —");
    await expectError("cannot buy own listing", () => createOrder(sellerSession, { listingSlug: active.slug, qty: 1 }));
    await expectError("cannot buy a PAUSED listing", () => createOrder(buyerSession, { listingSlug: paused.slug, qty: 1 }));
    await expectError("cannot buy out-of-stock listing", () => createOrder(buyerSession, { listingSlug: soldOut.slug, qty: 1 }));
    await expectError("qty > stock is rejected", () => createOrder(buyerSession, { listingSlug: active.slug, qty: 99 }));
    await expectError("unknown listing slug is rejected", () => createOrder(buyerSession, { listingSlug: `nope-${stamp}`, qty: 1 }));

    console.log("\n— state machine —");
    ok("canTransition AWAITING_PAYMENT→PAID", canTransition("AWAITING_PAYMENT", "PAID"));
    ok("canTransition PAID→COMPLETED is ILLEGAL", !canTransition("PAID", "COMPLETED"));
    ok("canTransition COMPLETED→anything is ILLEGAL (terminal)", !canTransition("COMPLETED", "PAID"));

    const tx = await createOrder(buyerSession, { listingSlug: txTestL.slug, qty: 1 });
    const paid = await transitionOrder(tx.id, "PAID");
    ok("AWAITING_PAYMENT → PAID applied", paid.status === "PAID");
    await expectError("illegal PAID → COMPLETED rejected", () => transitionOrder(tx.id, "COMPLETED"));
    const delivered = await transitionOrder(tx.id, "DELIVERED");
    ok("PAID → DELIVERED applied", delivered.status === "DELIVERED");
    const completed = await transitionOrder(tx.id, "COMPLETED");
    ok("DELIVERED → COMPLETED applied", completed.status === "COMPLETED");

    console.log("\n— ownership (getOrder) —");
    ok("buyer can read own order", (await getOrder(buyerSession, o1.id))?.id === o1.id);
    ok("seller of the order can read it", (await getOrder(sellerSession, o1.id))?.id === o1.id);
    ok("unrelated user gets null (404, not 403)", (await getOrder(otherSession, o1.id)) === null);

    console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  } finally {
    await db.order.deleteMany({ where: { buyer: { email: { in: Object.values(emails) } } } });
    await db.listing.deleteMany({ where: { seller: { user: { email: { in: Object.values(emails) } } } } });
    await db.user.deleteMany({ where: { email: { in: Object.values(emails) } } });
    await db.$disconnect();
  }
  if (fail > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
