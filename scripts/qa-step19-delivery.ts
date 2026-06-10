/**
 * Step 19 QA — auto/instant delivery. Drives the REAL services + payment path against the live
 * dev DB: encryption fail-closed, ownership/type guards, atomic assignment at PAID, decrypt-on-read
 * authz, stockout MANUAL-fallback (payment never fails), auto-pause/unpause, and the concurrency
 * guarantee (N parallel PAID events → each AVAILABLE item to exactly one order). Cleans up in finally.
 * Run: npx tsx scripts/qa-step19-delivery.ts
 */
import { db } from "../src/lib/db";
import { encrypt, decrypt, isEncryptionAvailable } from "../src/lib/encryption";
import { createListing } from "../src/server/services/listings";
import { createOrder } from "../src/server/services/orders";
import { applyPaymentEvent } from "../src/server/services/payments";
import {
  addDeliveryItems,
  deleteDeliveryItem,
  getDeliveryItemCount,
  getDeliveryContentForOrder,
  pauseListingOnStockout,
} from "../src/server/services/delivery";

let pass = 0;
let fail = 0;
function ok(name: string, cond: boolean, extra = "") {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.error(`  ✗ ${name} ${extra}`); }
}
async function threw(fn: () => Promise<unknown>): Promise<string | null> {
  try { await fn(); return null; } catch (e) { return e instanceof Error ? e.message : String(e); }
}

async function main() {
  const stamp = Date.now();
  const buyer = await db.user.create({ data: { email: `qad-b-${stamp}@test.getx.live`, name: "QAD Buyer", emailVerified: new Date(), emailNotifications: false } });
  const other = await db.user.create({ data: { email: `qad-o-${stamp}@test.getx.live`, name: "QAD Other", emailVerified: new Date(), emailNotifications: false } });
  const sellerUser = await db.user.create({ data: { email: `qad-s-${stamp}@test.getx.live`, name: "QAD Seller", emailVerified: new Date(), emailNotifications: false } });
  const seller = await db.sellerProfile.create({ data: { userId: sellerUser.id, displayName: "QAD Store", kycStatus: "APPROVED" } });
  const game = await db.game.findFirstOrThrow({ include: { categories: true } });
  const cat = game.categories[0];
  const sellerSession = { id: sellerUser.id, role: "SELLER" as const };
  const buyerSession = { id: buyer.id, role: "BUYER" as const };

  const mkListing = async (slug: string, deliveryType: "INSTANT" | "MANUAL", stock = 10) => {
    await createListing(sellerSession, { gameId: game.id, categoryId: cat.id, type: cat.kind, title: `QAD ${slug}`, description: "Auto-delivery QA listing.", price: 100000, stock, deliveryType, attributes: {}, images: [], publish: true });
    const l = await db.listing.findFirstOrThrow({ where: { sellerId: seller.id }, orderBy: { createdAt: "desc" } });
    await db.listing.update({ where: { id: l.id }, data: { slug } });
    return l.id;
  };
  const concBuyerIds: string[] = []; // extra buyers created for the concurrency test (cleaned up in finally)

  const mkPaid = async (slug: string) => {
    const order = await createOrder(buyerSession, { listingSlug: slug, qty: 1 });
    const ref = `qad-ref-${order.id}`;
    await db.payment.create({ data: { orderId: order.id, provider: "RAZORPAY", providerRef: ref, amountMinor: order.totalMinor, currency: "INR", status: "PENDING" } });
    const res = await applyPaymentEvent({ provider: "RAZORPAY", providerEventId: `qad-evt-${order.id}`, providerRef: ref, kind: "CONFIRMED", amountMinor: order.totalMinor, currency: "INR", raw: { qa: true } });
    return { order, res };
  };

  try {
    console.log("\n=== encryption (fail-closed) ===");
    const rt = encrypt("hero/secret-pass-42");
    ok("encrypt → decrypt roundtrip identical", decrypt(rt) === "hero/secret-pass-42");
    ok("ciphertext is not the plaintext", !rt.includes("hero/secret-pass-42"));
    const savedKey = process.env.DELIVERY_ENCRYPTION_KEY;
    delete process.env.DELIVERY_ENCRYPTION_KEY;
    ok("isEncryptionAvailable false when key missing", isEncryptionAvailable() === false);
    ok("encrypt throws when key missing (fail-closed)", (await threw(async () => encrypt("x")))?.includes("DELIVERY_ENCRYPTION_KEY") === true);
    process.env.DELIVERY_ENCRYPTION_KEY = savedKey;
    ok("isEncryptionAvailable true when key restored", isEncryptionAvailable() === true);

    console.log("\n=== seller stock guards ===");
    const instant = await mkListing(`qad-instant-${stamp}`, "INSTANT");
    const manual = await mkListing(`qad-manual-${stamp}`, "MANUAL");
    ok("addDeliveryItems rejects non-owner", (await threw(() => addDeliveryItems(instant, other.id, ["x"])))?.includes("not found") === true);
    ok("addDeliveryItems rejects MANUAL listing", (await threw(() => addDeliveryItems(manual, sellerUser.id, ["x"])))?.includes("instant") === true);
    const added = await addDeliveryItems(instant, sellerUser.id, ["ACC-AAAA-1111", "ACC-BBBB-2222", "ACC-CCCC-3333"]);
    ok("addDeliveryItems added 3", added === 3);
    ok("getDeliveryItemCount = 3", (await getDeliveryItemCount(instant)) === 3);
    ok("items stored ENCRYPTED at rest (not plaintext)", (await db.deliveryItem.findFirstOrThrow({ where: { listingId: instant } })).content.includes("ACC-AAAA-1111") === false);

    console.log("\n=== instant delivery at PAID ===");
    const { order: o1, res: r1 } = await mkPaid(`qad-instant-${stamp}`);
    ok("PAID applied + autoDelivered", r1.outcome === "applied" && r1.outcome === "applied" && (r1 as { autoDelivered?: boolean }).autoDelivered === true);
    const o1row = await db.order.findUniqueOrThrow({ where: { id: o1.id } });
    ok("order moved PAID → DELIVERED", o1row.status === "DELIVERED");
    ok("order autoReleaseAt set (escrow timer started)", o1row.autoReleaseAt !== null);
    ok("one item marked DELIVERED for the order", (await db.deliveryItem.count({ where: { orderId: o1.id, status: "DELIVERED" } })) === 1);
    ok("stock now 2", (await getDeliveryItemCount(instant)) === 2);
    const content = await getDeliveryContentForOrder(o1.id, buyer.id);
    ok("buyer reads decrypted content (one of the originals)", ["ACC-AAAA-1111", "ACC-BBBB-2222", "ACC-CCCC-3333"].includes(content ?? ""));
    ok("third-party user CANNOT read the delivery (authz)", (await getDeliveryContentForOrder(o1.id, other.id)) === null);
    ok("seller CAN read the delivery", (await getDeliveryContentForOrder(o1.id, sellerUser.id)) !== null);

    console.log("\n=== concurrency: 2 items, 3 buyers racing (parallel PAID) ===");
    const conc = await mkListing(`qad-conc-${stamp}`, "INSTANT");
    await addDeliveryItems(conc, sellerUser.id, ["CONC-1", "CONC-2"]);
    // 3 DISTINCT buyers (createOrder is idempotent per buyer+listing, so one buyer can't make 3 orders).
    const concBuyers = await Promise.all([0, 1, 2].map((i) => db.user.create({ data: { email: `qad-cb${i}-${stamp}@test.getx.live`, name: `QAD CB${i}`, emailVerified: new Date(), emailNotifications: false } })));
    concBuyerIds.push(...concBuyers.map((b) => b.id));
    const orders = await Promise.all(concBuyers.map((b) => createOrder({ id: b.id, role: "BUYER" as const }, { listingSlug: `qad-conc-${stamp}`, qty: 1 })));
    await Promise.all(orders.map((o) => db.payment.create({ data: { orderId: o.id, provider: "RAZORPAY", providerRef: `qad-cref-${o.id}`, amountMinor: o.totalMinor, currency: "INR", status: "PENDING" } })));
    const results = await Promise.all(orders.map((o) => applyPaymentEvent({ provider: "RAZORPAY", providerEventId: `qad-cevt-${o.id}`, providerRef: `qad-cref-${o.id}`, kind: "CONFIRMED", amountMinor: o.totalMinor, currency: "INR", raw: {} })));
    const delivered = results.filter((r) => r.outcome === "applied" && (r as { autoDelivered?: boolean }).autoDelivered === true).length;
    const stockedOut = results.filter((r) => r.outcome === "applied" && (r as { deliveryStockout?: boolean }).deliveryStockout === true).length;
    ok("exactly 2 orders auto-delivered", delivered === 2, `${delivered}`);
    ok("exactly 1 order stocked out (manual fallback)", stockedOut === 1, `${stockedOut}`);
    const deliveredItems = await db.deliveryItem.findMany({ where: { listingId: conc, status: "DELIVERED" }, select: { orderId: true } });
    ok("both items delivered to DISTINCT orders (no double-assign)", deliveredItems.length === 2 && new Set(deliveredItems.map((d) => d.orderId)).size === 2);
    ok("all 3 payments succeeded (none failed by stockout)", results.every((r) => r.outcome === "applied"));

    console.log("\n=== stockout fallback + delete guard ===");
    const stockoutOrder = orders.find((o) => { const r = results[orders.indexOf(o)]; return r.outcome === "applied" && (r as { deliveryStockout?: boolean }).deliveryStockout; })!;
    ok("stocked-out order stayed PAID (not DELIVERED)", (await db.order.findUniqueOrThrow({ where: { id: stockoutOrder.id } })).status === "PAID");
    const deliveredItemId = deliveredItems.length ? (await db.deliveryItem.findFirstOrThrow({ where: { listingId: conc, status: "DELIVERED" } })).id : "";
    ok("deleteDeliveryItem rejects a DELIVERED item", (await threw(() => deleteDeliveryItem(deliveredItemId, sellerUser.id)))?.includes("Delivered") === true);

    console.log("\n=== auto-pause on stockout + auto-unpause on refill ===");
    await pauseListingOnStockout(conc);
    ok("pauseListingOnStockout → listing PAUSED", (await db.listing.findUniqueOrThrow({ where: { id: conc } })).status === "PAUSED");
    ok("auto_pause_stockout audit written", (await db.auditLog.count({ where: { entity: "Listing", entityId: conc, action: "auto_pause_stockout" } })) === 1);
    await addDeliveryItems(conc, sellerUser.id, ["REFILL-1"]);
    ok("refill auto-unpaused the listing → ACTIVE", (await db.listing.findUniqueOrThrow({ where: { id: conc } })).status === "ACTIVE");

    console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  } finally {
    const userIds = [buyer.id, other.id, sellerUser.id, ...concBuyerIds];
    const orderIds = (await db.order.findMany({ where: { buyerId: { in: userIds } }, select: { id: true } })).map((o) => o.id);
    const listingIds = (await db.listing.findMany({ where: { sellerId: seller.id }, select: { id: true } })).map((l) => l.id);
    await db.notification.deleteMany({ where: { userId: { in: userIds } } });
    await db.fraudFlag.deleteMany({ where: { targetId: { in: orderIds } } });
    await db.deliveryItem.deleteMany({ where: { sellerId: seller.id } });
    // ONLY our own audit rows — scoped to our order ids, our listing ids, or our actor ids.
    await db.auditLog.deleteMany({ where: { OR: [{ entityId: { in: [...orderIds, ...listingIds] } }, { actorId: { in: userIds } }] } });
    await db.processedWebhook.deleteMany({ where: { providerEventId: { contains: `${stamp}` } } });
    await db.ledgerEntry.deleteMany({ where: { orderId: { in: orderIds } } });
    await db.payment.deleteMany({ where: { orderId: { in: orderIds } } });
    await db.order.deleteMany({ where: { buyerId: { in: userIds } } });
    await db.wallet.deleteMany({ where: { sellerProfileId: seller.id } });
    await db.listing.deleteMany({ where: { sellerId: seller.id } });
    await db.sellerProfile.deleteMany({ where: { id: seller.id } });
    await db.user.deleteMany({ where: { id: { in: userIds } } });
    await db.$disconnect();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
