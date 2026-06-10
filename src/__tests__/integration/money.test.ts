import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { db } from "@/lib/db";
import { createOrder } from "@/server/services/orders";
import { applyPaymentEvent } from "@/server/services/payments";
import {
  confirmReceipt,
  markDelivered,
  refund,
  PLATFORM_WALLET_ID,
} from "@/server/services/escrow";
import { getWalletBalances } from "@/server/services/wallet";

/**
 * Money-path integration tests (Step 34) — the real escrow ledger end to end:
 * createOrder → applyPaymentEvent(CONFIRMED) → markDelivered → confirmReceipt,
 * plus the refund reversal. Mirrors scripts/qa-step10.ts but as a CI-runnable
 * vitest suite.
 *
 * GATED on TEST_DATABASE_URL — these write/read real rows, so they only run
 * against a DISPOSABLE test DB (a Neon branch). vitest.setup.ts points Prisma
 * at it. Without it the whole suite skips (it never touches dev/prod data).
 * Provision the test branch at launch (see docs/DECISIONS.md + launch checklist).
 */
const RUN = !!process.env.TEST_DATABASE_URL;
const stamp = Date.now();

describe.skipIf(!RUN)("escrow money paths", () => {
  let sellerProfileId = "";
  let sellerWalletId = "";
  let gameId = "";
  let categoryId = "";
  let categoryKind: "ACCOUNT" | "ITEM" | "CURRENCY" | "BOOSTING" = "ACCOUNT";
  let buyer = { id: "", role: "BUYER" as const };
  const userIds: string[] = [];
  const listingIds: string[] = [];
  const orderIds: string[] = [];

  beforeAll(async () => {
    const buyerUser = await db.user.create({
      data: { email: `int-buyer-${stamp}@test.getx.live`, emailVerified: new Date() },
    });
    const sellerUser = await db.user.create({
      data: { email: `int-seller-${stamp}@test.getx.live`, emailVerified: new Date() },
    });
    userIds.push(buyerUser.id, sellerUser.id);
    buyer = { id: buyerUser.id, role: "BUYER" };
    const seller = await db.sellerProfile.create({
      data: { userId: sellerUser.id, displayName: "Int Seller" },
    });
    sellerProfileId = seller.id;
    const game = await db.game.findFirstOrThrow({ include: { categories: true } });
    gameId = game.id;
    categoryId = game.categories[0].id;
    categoryKind = game.categories[0].kind;
  });

  afterAll(async () => {
    // Children → parents (FK order). Scoped to this run's entities only.
    await db.ledgerEntry.deleteMany({ where: { orderId: { in: orderIds } } }).catch(() => {});
    await db.orderDelivery.deleteMany({ where: { orderId: { in: orderIds } } }).catch(() => {});
    await db.payment.deleteMany({ where: { orderId: { in: orderIds } } }).catch(() => {});
    await db.order.deleteMany({ where: { id: { in: orderIds } } }).catch(() => {});
    await db.listing.deleteMany({ where: { id: { in: listingIds } } }).catch(() => {});
    if (sellerWalletId) {
      await db.ledgerEntry.deleteMany({ where: { walletId: sellerWalletId } }).catch(() => {});
      await db.wallet.deleteMany({ where: { id: sellerWalletId } }).catch(() => {});
    }
    await db.sellerProfile.deleteMany({ where: { id: sellerProfileId } }).catch(() => {});
    await db.user.deleteMany({ where: { id: { in: userIds } } }).catch(() => {});
    await db.$disconnect();
  });

  async function mkListing(slug: string, stock = 2) {
    const listing = await db.listing.create({
      data: {
        sellerId: sellerProfileId,
        gameId,
        categoryId,
        type: categoryKind,
        title: `Int ${slug}`,
        slug,
        description: "integration listing",
        priceMinor: 100_000,
        currency: "INR",
        stock,
        deliveryType: "MANUAL",
        status: "ACTIVE",
        attributes: {},
      },
    });
    listingIds.push(listing.id);
    return listing;
  }

  async function mkPaidOrder(slug: string, stock = 2, qty = 1) {
    await mkListing(slug, stock);
    const order = await createOrder(buyer, { listingSlug: slug, qty });
    orderIds.push(order.id);
    const ref = `int-ref-${slug}`;
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
      providerEventId: `int-evt-${slug}`,
      providerRef: ref,
      kind: "CONFIRMED",
      amountMinor: order.totalMinor,
      currency: "INR",
      raw: { integration: true },
    });
    expect(res.outcome).toBe("applied");
    const wallet = await db.wallet.findUniqueOrThrow({ where: { sellerProfileId } });
    sellerWalletId = wallet.id;
    return db.order.findUniqueOrThrow({ where: { id: order.id } });
  }

  it("holds funds in escrow on PAID, releases the net on confirm", async () => {
    const sellerUserId = (await db.sellerProfile.findUniqueOrThrow({ where: { id: sellerProfileId }, select: { userId: true } })).userId;
    const order = await mkPaidOrder(`int-happy-${stamp}`);

    // PAID → full total held, nothing available yet.
    let bal = await getWalletBalances(sellerWalletId);
    expect(bal.heldMinor).toBe(order.totalMinor);
    expect(bal.availableMinor).toBe(0);

    await markDelivered(sellerUserId, order.id, "here is your account");
    const delivered = await db.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(delivered.status).toBe("DELIVERED");

    await confirmReceipt(buyer.id, order.id);
    const completed = await db.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(completed.status).toBe("COMPLETED");

    // After release: hold cleared, seller's net (subtotal − commission) available.
    bal = await getWalletBalances(sellerWalletId);
    const net = order.unitPriceMinor * order.qty - order.sellerFeeMinor;
    expect(bal.heldMinor).toBe(0);
    expect(bal.availableMinor).toBe(net);

    // Platform wallet collected buyer fee + commission.
    const platform = await getWalletBalances(PLATFORM_WALLET_ID);
    expect(platform.grossMinor).toBeGreaterThanOrEqual(order.feeMinor + order.sellerFeeMinor);
  });

  it("refund reverses the hold, restocks, and is idempotent", async () => {
    const order = await mkPaidOrder(`int-refund-${stamp}`, 1);
    const before = await getWalletBalances(sellerWalletId);
    expect(before.heldMinor).toBe(order.totalMinor);

    const first = await refund(order.id, "integration refund");
    expect(first).toBe("refunded");
    const refunded = await db.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(refunded.status).toBe("REFUNDED");

    const after = await getWalletBalances(sellerWalletId);
    expect(after.heldMinor).toBe(0); // hold reversed

    // Listing restocked + reactivated.
    const listing = await db.listing.findFirstOrThrow({ where: { id: { in: listingIds }, slug: `int-refund-${stamp}` } });
    expect(listing.stock).toBeGreaterThanOrEqual(1);
    expect(listing.status).toBe("ACTIVE");

    // Second refund is a no-op (never double-reverses).
    expect(await refund(order.id, "again")).toBe("noop");
  });
});
