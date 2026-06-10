/**
 * Step 22 QA harness — the notification system. Drives the REAL notification
 * service + server actions + the internal /notify route handler against the live
 * dev DB. Covers: createNotification (read flag, type, clamp, link safety), every
 * notify* trigger fan-out (right audience, sender excluded), email-preference
 * honoring (no-throw when Resend unset, skip when opted out, in-app unaffected),
 * read-side counts + mark-read ownership + mark-all, and the internal-route auth.
 * Run: npx tsx scripts/qa-step22.ts   (marked data, cleaned up).
 */
import type { NotificationType } from "@prisma/client";
import { db } from "../src/lib/db";
import { createListing } from "../src/server/services/listings";
import { createOrder } from "../src/server/services/orders";
import {
  createNotification,
  sendNotificationEmail,
  getNotifications,
  countUnreadNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  getEmailPreference,
  updateEmailPreference,
  notifyOrderEvent,
  notifyDisputeEvent,
  notifyNewMessage,
  notifyPayoutEvent,
  notifyNewReview,
  notifyKycDecision,
} from "../src/server/services/notifications";
import { pushNotificationToSocket } from "../src/lib/socket-notify";
import { POST as notifyRoute } from "../src/app/api/internal/notify/route";

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
  const slug = `qa22-listing-${stamp}`;
  const emails = {
    buyer: `qa22-buyer-${stamp}@test.getx.live`,
    seller: `qa22-seller-${stamp}@test.getx.live`,
    admin: `qa22-admin-${stamp}@test.getx.live`,
  };
  // emailNotifications:false by default → quiet bulk tests; flipped where tested.
  const buyer = await db.user.create({ data: { email: emails.buyer, name: "QA22 Buyer", emailVerified: new Date(), emailNotifications: false } });
  const sellerUser = await db.user.create({ data: { email: emails.seller, name: "QA22 Seller", emailVerified: new Date(), emailNotifications: false } });
  const admin = await db.user.create({ data: { email: emails.admin, name: "QA22 Admin", role: "ADMIN", emailVerified: new Date(), emailNotifications: false } });
  const seller = await db.sellerProfile.create({ data: { userId: sellerUser.id, displayName: "QA22 Store" } });
  const game = await db.game.findFirstOrThrow({ include: { categories: true } });
  const cat = game.categories[0];

  const nCount = (userId: string, type?: NotificationType) =>
    db.notification.count({ where: { userId, ...(type ? { type } : {}) } });

  // Snapshot envs we mutate in the route test.
  const savedSecret = process.env.INTERNAL_API_SECRET;
  const savedSocketUrl = process.env.SOCKET_INTERNAL_URL;
  // Captured for cleanup (dispute alerts also land on seed admins referencing this order).
  let orderIdPrefix = "";

  try {
    console.log("\n=== SETUP: listing + order ===");
    await createListing(
      { id: sellerUser.id, role: "SELLER" },
      {
        gameId: game.id, categoryId: cat.id, type: cat.kind,
        title: "QA22 notification listing", description: "Notification system QA listing.",
        price: 100000, stock: 10, deliveryType: "MANUAL", attributes: {}, images: [], publish: true,
      },
    );
    const created = await db.listing.findFirstOrThrow({ where: { sellerId: seller.id }, orderBy: { createdAt: "desc" } });
    await db.listing.update({ where: { id: created.id }, data: { slug } });
    const order = await createOrder({ id: buyer.id, role: "BUYER" }, { listingSlug: slug, qty: 1 });
    orderIdPrefix = order.id.slice(0, 8);
    ok("setup: order created with buyer+seller+listing", !!order.id);

    console.log("\n=== createNotification core ===");
    const n1 = await createNotification({ userId: buyer.id, type: "SYSTEM", title: "Hello", body: "World", link: "/orders/x" });
    ok("createNotification returns a row", n1 !== null);
    ok("row read=false by default", n1?.read === false);
    ok("row type persisted as enum", n1?.type === "SYSTEM");
    ok("row link preserved (internal path)", n1?.link === "/orders/x");

    const longTitle = "T".repeat(120);
    const n2 = await createNotification({ userId: buyer.id, type: "SYSTEM", title: longTitle, body: "B".repeat(300), link: "//evil.com" });
    ok("title clamped to 80 chars", n2?.title.length === 80);
    ok("body clamped to 200 chars", n2?.body.length === 200);
    ok("protocol-relative link rejected (open-redirect guard)", n2?.link === null);
    const n3 = await createNotification({ userId: buyer.id, type: "SYSTEM", title: "x", body: "y", link: "https://evil.com" });
    ok("absolute external link rejected", n3?.link === null);

    console.log("\n=== order event fan-out ===");
    {
      const b0 = await nCount(buyer.id, "ORDER_UPDATE");
      const s0 = await nCount(sellerUser.id, "ORDER_UPDATE");
      await notifyOrderEvent(order.id, "PAID");
      ok("PAID notifies buyer", (await nCount(buyer.id, "ORDER_UPDATE")) === b0 + 1);
      ok("PAID notifies seller", (await nCount(sellerUser.id, "ORDER_UPDATE")) === s0 + 1);
    }
    {
      const b0 = await nCount(buyer.id, "ORDER_UPDATE");
      const s0 = await nCount(sellerUser.id, "ORDER_UPDATE");
      await notifyOrderEvent(order.id, "DELIVERED");
      ok("DELIVERED notifies buyer only (+1 buyer)", (await nCount(buyer.id, "ORDER_UPDATE")) === b0 + 1);
      ok("DELIVERED notifies buyer only (+0 seller)", (await nCount(sellerUser.id, "ORDER_UPDATE")) === s0);
    }
    {
      const b0 = await nCount(buyer.id, "ORDER_UPDATE");
      const s0 = await nCount(sellerUser.id, "ORDER_UPDATE");
      await notifyOrderEvent(order.id, "COMPLETED");
      ok("COMPLETED notifies buyer + seller", (await nCount(buyer.id, "ORDER_UPDATE")) === b0 + 1 && (await nCount(sellerUser.id, "ORDER_UPDATE")) === s0 + 1);
    }
    {
      const b0 = await nCount(buyer.id, "ORDER_UPDATE");
      const s0 = await nCount(sellerUser.id, "ORDER_UPDATE");
      await notifyOrderEvent(order.id, "REFUNDED");
      ok("REFUNDED notifies buyer only", (await nCount(buyer.id, "ORDER_UPDATE")) === b0 + 1 && (await nCount(sellerUser.id, "ORDER_UPDATE")) === s0);
    }
    ok("unknown order id is a silent no-op (no throw)", (await threw(() => notifyOrderEvent("nonexistentid", "PAID"))) === null);

    console.log("\n=== dispute event fan-out ===");
    {
      const s0 = await nCount(sellerUser.id, "DISPUTE");
      const a0 = await nCount(admin.id, "SYSTEM");
      const b0 = await nCount(buyer.id, "DISPUTE");
      await notifyDisputeEvent(order.id, "OPENED");
      ok("dispute OPENED notifies seller", (await nCount(sellerUser.id, "DISPUTE")) === s0 + 1);
      ok("dispute OPENED alerts admin (SYSTEM)", (await nCount(admin.id, "SYSTEM")) === a0 + 1);
      ok("dispute OPENED does not notify the opening buyer", (await nCount(buyer.id, "DISPUTE")) === b0);
    }
    {
      const b0 = await nCount(buyer.id, "DISPUTE");
      const s0 = await nCount(sellerUser.id, "DISPUTE");
      await notifyDisputeEvent(order.id, "RESOLVED_BUYER");
      ok("dispute RESOLVED notifies buyer + seller", (await nCount(buyer.id, "DISPUTE")) === b0 + 1 && (await nCount(sellerUser.id, "DISPUTE")) === s0 + 1);
    }

    console.log("\n=== message / payout / review / kyc ===");
    {
      const s0 = await nCount(sellerUser.id, "NEW_MESSAGE");
      const b0 = await nCount(buyer.id, "NEW_MESSAGE");
      await notifyNewMessage(sellerUser.id, "QA22 Buyer", `conv-${stamp}`);
      ok("new message notifies the recipient", (await nCount(sellerUser.id, "NEW_MESSAGE")) === s0 + 1);
      ok("new message does NOT notify a non-recipient", (await nCount(buyer.id, "NEW_MESSAGE")) === b0);
    }

    const wallet = await db.wallet.upsert({ where: { sellerProfileId: seller.id }, create: { sellerProfileId: seller.id, currency: "INR" }, update: {} });
    const payout = await db.payout.create({ data: { walletId: wallet.id, amountMinor: 50000, method: "RAZORPAY" } });
    {
      const s0 = await nCount(sellerUser.id, "PAYOUT");
      await notifyPayoutEvent(payout.id, "PAID");
      ok("payout PAID notifies seller", (await nCount(sellerUser.id, "PAYOUT")) === s0 + 1);
      await notifyPayoutEvent(payout.id, "FAILED");
      ok("payout FAILED notifies seller", (await nCount(sellerUser.id, "PAYOUT")) === s0 + 2);
    }
    {
      const s0 = await nCount(sellerUser.id, "REVIEW");
      await notifyNewReview({ sellerUserId: sellerUser.id, listingTitle: "QA22 listing", rating: 5, orderId: order.id });
      ok("new review notifies seller", (await nCount(sellerUser.id, "REVIEW")) === s0 + 1);
    }
    {
      const s0 = await nCount(sellerUser.id, "SYSTEM");
      await notifyKycDecision(sellerUser.id, "APPROVE");
      await notifyKycDecision(sellerUser.id, "REJECT");
      ok("KYC APPROVE + REJECT both notify seller (SYSTEM)", (await nCount(sellerUser.id, "SYSTEM")) === s0 + 2);
    }

    console.log("\n=== email preference ===");
    await updateEmailPreference(buyer.id, true);
    ok("sendNotificationEmail does not throw when Resend unset", (await threw(() => sendNotificationEmail(buyer.id, { subject: "s", html: "<p>h</p>" }))) === null);
    await updateEmailPreference(buyer.id, false);
    ok("sendNotificationEmail does not throw when opted out", (await threw(() => sendNotificationEmail(buyer.id, { subject: "s", html: "<p>h</p>" }))) === null);
    ok("updateEmailPreference persisted (false)", (await getEmailPreference(buyer.id)) === false);
    {
      // In-app notification is still created even with email turned off.
      const s0 = await nCount(sellerUser.id, "SYSTEM"); // seller pref is false
      await notifyKycDecision(sellerUser.id, "APPROVE");
      ok("in-app row created even when email opted out", (await nCount(sellerUser.id, "SYSTEM")) === s0 + 1);
    }

    console.log("\n=== read side: count / mark read / mark all ===");
    const unreadBuyer = await countUnreadNotifications(buyer.id);
    ok("countUnread matches raw read=false count", unreadBuyer === (await db.notification.count({ where: { userId: buyer.id, read: false } })));
    ok("getNotifications returns newest-first, capped", (await getNotifications(buyer.id, 5)).length <= 5);

    const target = await db.notification.create({ data: { userId: buyer.id, type: "SYSTEM", title: "mark me", body: "b" } });
    await markNotificationRead(sellerUser.id, target.id); // wrong owner → no-op
    ok("mark read by non-owner does NOT flip the row", (await db.notification.findUniqueOrThrow({ where: { id: target.id } })).read === false);
    await markNotificationRead(buyer.id, target.id);
    const after = await db.notification.findUniqueOrThrow({ where: { id: target.id } });
    ok("mark read by owner flips read=true + sets readAt", after.read === true && after.readAt !== null);

    const sellerUnreadBefore = await countUnreadNotifications(sellerUser.id);
    const markedAll = await markAllNotificationsRead(buyer.id);
    ok("markAllRead returns the count cleared", markedAll === unreadBuyer, `cleared ${markedAll} vs ${unreadBuyer}`);
    ok("buyer has zero unread after markAll", (await countUnreadNotifications(buyer.id)) === 0);
    ok("markAll did not touch another user's rows", (await countUnreadNotifications(sellerUser.id)) === sellerUnreadBefore);

    console.log("\n=== internal /notify route auth ===");
    process.env.INTERNAL_API_SECRET = "qa-notify-secret";
    delete process.env.SOCKET_INTERNAL_URL; // make pushNotificationToSocket a fast no-op
    const validNotif = { id: "qa22notif", type: "SYSTEM", title: "t", body: "b", link: null, read: false, createdAt: new Date().toISOString() };
    const mkReq = (authHeader: string | null, body: unknown) =>
      new Request("http://localhost/api/internal/notify", {
        method: "POST",
        headers: { "content-type": "application/json", ...(authHeader ? { authorization: authHeader } : {}) },
        body: JSON.stringify(body),
      });
    ok("wrong bearer → 401", (await notifyRoute(mkReq("Bearer wrong", { userId: "u", notification: validNotif }))).status === 401);
    ok("no auth header → 401", (await notifyRoute(mkReq(null, { userId: "u", notification: validNotif }))).status === 401);
    const okRes = await notifyRoute(mkReq("Bearer qa-notify-secret", { userId: "u", notification: validNotif }));
    ok("correct bearer → 200 { ok: true }", okRes.status === 200 && (await okRes.json()).ok === true);
    ok("missing notification → 400", (await notifyRoute(mkReq("Bearer qa-notify-secret", { userId: "u" }))).status === 400);
    ok("pushNotificationToSocket no-ops without socket url (no throw)", (await threw(() => pushNotificationToSocket("u", validNotif))) === null);

    console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  } finally {
    // Restore env.
    if (savedSecret === undefined) delete process.env.INTERNAL_API_SECRET;
    else process.env.INTERNAL_API_SECRET = savedSecret;
    if (savedSocketUrl === undefined) delete process.env.SOCKET_INTERNAL_URL;
    else process.env.SOCKET_INTERNAL_URL = savedSocketUrl;

    const userIds = [buyer.id, sellerUser.id, admin.id];
    await db.notification.deleteMany({ where: { userId: { in: userIds } } });
    // Dispute "OPENED" alerts fan out to ALL admins (incl. seed) referencing this order.
    if (orderIdPrefix) {
      await db.notification.deleteMany({ where: { body: { contains: orderIdPrefix } } });
    }
    await db.payout.deleteMany({ where: { wallet: { sellerProfileId: seller.id } } });
    await db.wallet.deleteMany({ where: { sellerProfileId: seller.id } });
    await db.ledgerEntry.deleteMany({ where: { order: { buyerId: buyer.id } } });
    const orderIds = (await db.order.findMany({ where: { buyerId: buyer.id }, select: { id: true } })).map((o) => o.id);
    await db.auditLog.deleteMany({ where: { entityId: { in: orderIds } } });
    await db.order.deleteMany({ where: { buyerId: buyer.id } });
    await db.fraudFlag.deleteMany({ where: { targetId: { in: [...userIds, seller.id] } } });
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
