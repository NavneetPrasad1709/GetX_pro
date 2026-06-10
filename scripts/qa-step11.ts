/**
 * Step 11 QA harness — chat service, internal API, socket token. Exercises the
 * REAL code paths against the live dev DB: the chat service (membership,
 * get-or-create, history pagination, persist, read, unread), the actual internal
 * ROUTE handlers (authorize/message/read) invoked with crafted Requests (valid +
 * forged secret), and the socket-token mint/verify crypto. The Socket.io relay
 * itself is tested separately in socket-server/test/relay.test.ts.
 * Run: npx tsx scripts/qa-step11.ts   (creates marked data, cleans up after).
 */
import { db } from "../src/lib/db";
import { createOrder } from "../src/server/services/orders";
import {
  countUnread,
  getMessages,
  getOrCreateConversation,
  isParticipant,
  listConversations,
  markRead,
  persistMessage,
} from "../src/server/services/chat";
import { mintSocketToken, verifySocketToken } from "../src/lib/socket-token";
// The socket server's verifier is an intentional COPY — assert it stays in
// agreement with the app's minter (catches silent drift between the two).
import { createTokenVerifier } from "../socket-server/src/auth";
import { POST as authorizeRoute } from "../src/app/api/internal/socket/authorize/route";
import { POST as messageRoute } from "../src/app/api/internal/socket/message/route";
import { POST as readRoute } from "../src/app/api/internal/socket/read/route";

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
async function expectThrow(fn: () => Promise<unknown>): Promise<string | null> {
  try {
    await fn();
    return null;
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
}

const INTERNAL_SECRET = "qa11-internal-secret";
const SOCKET_SECRET = "qa11-socket-secret";

function internalReq(path: string, payload: unknown, secret = INTERNAL_SECRET) {
  return new Request(`http://localhost${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${secret}` },
    body: JSON.stringify(payload),
  });
}

async function main() {
  const stamp = Date.now();
  process.env.INTERNAL_API_SECRET = INTERNAL_SECRET;
  process.env.SOCKET_AUTH_SECRET = SOCKET_SECRET;

  const emails = {
    buyer: `qa11-buyer-${stamp}@test.getx.live`,
    seller: `qa11-seller-${stamp}@test.getx.live`,
    stranger: `qa11-stranger-${stamp}@test.getx.live`,
  };
  const buyer = await db.user.create({ data: { email: emails.buyer, name: "QA11 Buyer", emailVerified: new Date() } });
  const stranger = await db.user.create({ data: { email: emails.stranger, emailVerified: new Date() } });
  const sellerUser = await db.user.create({ data: { email: emails.seller, emailVerified: new Date() } });
  const seller = await db.sellerProfile.create({
    data: { userId: sellerUser.id, displayName: "QA11 Seller" },
  });
  const game = await db.game.findFirstOrThrow({ include: { categories: true } });
  const cat = game.categories[0];

  try {
    console.log("\n— socket token mint / verify —");
    const token = mintSocketToken({ sub: buyer.id, name: "QA11 Buyer", image: null }, SOCKET_SECRET);
    const claims = verifySocketToken(token, SOCKET_SECRET);
    ok("valid token verifies to the right user", claims?.sub === buyer.id && claims?.name === "QA11 Buyer");
    ok("tampered token rejected", verifySocketToken(token + "x", SOCKET_SECRET) === null);
    ok("wrong secret rejected", verifySocketToken(token, "not-the-secret") === null);
    ok(
      "expired token rejected",
      verifySocketToken(
        mintSocketToken({ sub: buyer.id, name: null, image: null }, SOCKET_SECRET, 1000),
        SOCKET_SECRET,
        100_000, // "now" far past the 5-min expiry
      ) === null,
    );
    // Cross-process: the socket server's COPY of the verifier must agree with
    // the app's minter — else chat silently breaks / auth diverges.
    const ssVerify = createTokenVerifier(SOCKET_SECRET);
    ok("socket-server verifier accepts the app-minted token", ssVerify(token)?.id === buyer.id);
    ok(
      "socket-server verifier rejects tampered + wrong-secret (matches the app)",
      ssVerify(token + "x") === null && createTokenVerifier("other-secret")(token) === null,
    );

    console.log("\n— get-or-create conversation (seller / listing) —");
    const c1 = await getOrCreateConversation(buyer.id, { sellerProfileId: seller.id });
    ok("creates a buyer↔seller conversation", typeof c1.id === "string");
    const c1again = await getOrCreateConversation(buyer.id, { sellerProfileId: seller.id });
    ok("idempotent — same pair returns the same conversation", c1again.id === c1.id);
    const selfChat = await expectThrow(() =>
      getOrCreateConversation(sellerUser.id, { sellerProfileId: seller.id }),
    );
    ok("self-chat blocked", selfChat?.includes("yourself") === true, selfChat ?? "");

    console.log("\n— membership —");
    ok("buyer is a participant", await isParticipant(buyer.id, c1.id));
    ok("seller's user is a participant", await isParticipant(sellerUser.id, c1.id));
    ok("stranger is NOT a participant", !(await isParticipant(stranger.id, c1.id)));

    console.log("\n— persist + history + ownership —");
    const m1 = await persistMessage(buyer.id, c1.id, "gm, is this account legit?");
    const m2 = await persistMessage(sellerUser.id, c1.id, "yes — 100% legit, escrow protected");
    const m3 = await persistMessage(buyer.id, c1.id, "great, buying now");
    ok("messages persisted with sender", m1.senderId === buyer.id && m2.senderId === sellerUser.id);
    const strangerPersist = await expectThrow(() => persistMessage(stranger.id, c1.id, "let me in"));
    ok("non-member cannot persist", strangerPersist?.includes("not part") === true, strangerPersist ?? "");

    const page1 = await getMessages(buyer.id, c1.id, { limit: 2 });
    ok(
      "history newest page, oldest→newest order",
      page1?.messages.length === 2 &&
        page1.messages[0].id === m2.id &&
        page1.messages[1].id === m3.id,
      JSON.stringify(page1?.messages.map((m) => m.body)),
    );
    ok("nextCursor present when more exist", Boolean(page1?.nextCursor));
    const page2 = await getMessages(buyer.id, c1.id, { limit: 2, cursor: page1!.nextCursor! });
    ok("load-older returns the earlier message", page2?.messages.length === 1 && page2.messages[0].id === m1.id);
    ok("non-member history → null (404)", (await getMessages(stranger.id, c1.id)) === null);

    console.log("\n— unread + read —");
    // buyer has 1 unread (m2 from the seller); seller has 2 unread (m1, m3).
    ok("buyer unread = 1 (the seller's message)", (await countUnread(buyer.id)) === 1, String(await countUnread(buyer.id)));
    ok("seller unread = 2 (the buyer's messages)", (await countUnread(sellerUser.id)) === 2, String(await countUnread(sellerUser.id)));
    const readCount = await markRead(buyer.id, c1.id);
    ok("markRead clears the other party's messages for the reader", readCount === 1);
    ok("buyer unread now 0", (await countUnread(buyer.id)) === 0);
    ok("seller still has 2 unread (their view untouched)", (await countUnread(sellerUser.id)) === 2);

    const list = await listConversations(buyer.id);
    ok(
      "conversation list shows last message + 0 unread for buyer",
      list.length === 1 && list[0].lastMessage === "great, buying now" && list[0].unreadCount === 0,
      JSON.stringify(list),
    );

    console.log("\n— order-tied conversation —");
    const listing = await db.listing.create({
      data: {
        sellerId: seller.id, gameId: game.id, categoryId: cat.id, type: cat.kind,
        title: `QA11 ${stamp}`, slug: `qa11-${stamp}`, description: "QA11", priceMinor: 100000,
        currency: "INR", stock: 3, deliveryType: "MANUAL", status: "ACTIVE", attributes: {},
      },
    });
    const order = await createOrder({ id: buyer.id, role: "BUYER" }, { listingSlug: listing.slug, qty: 1 });
    const oc1 = await getOrCreateConversation(buyer.id, { orderId: order.id });
    const oc2 = await getOrCreateConversation(sellerUser.id, { orderId: order.id });
    ok("buyer + seller resolve to the SAME order conversation", oc1.id === oc2.id);
    const ocConvo = await db.conversation.findUniqueOrThrow({ where: { id: oc1.id } });
    ok("order conversation is tied to the order", ocConvo.orderId === order.id);
    const strangerOrder = await expectThrow(() => getOrCreateConversation(stranger.id, { orderId: order.id }));
    ok("non-party to the order is blocked", strangerOrder === "Order not found.");

    console.log("\n— internal API routes (real handlers) —");
    const noAuth = await authorizeRoute(
      new Request("http://localhost/api/internal/socket/authorize", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userId: buyer.id, conversationId: c1.id }),
      }),
    );
    ok("authorize without secret → 401", noAuth.status === 401);
    const badAuth = await authorizeRoute(internalReq("/api/internal/socket/authorize", { userId: buyer.id, conversationId: c1.id }, "wrong"));
    ok("authorize with wrong secret → 401", badAuth.status === 401);
    const memberAuth = await authorizeRoute(internalReq("/api/internal/socket/authorize", { userId: buyer.id, conversationId: c1.id }));
    ok("authorize member → 200 {ok:true}", memberAuth.status === 200 && (await memberAuth.json()).ok === true);
    const nonMemberAuth = await authorizeRoute(internalReq("/api/internal/socket/authorize", { userId: stranger.id, conversationId: c1.id }));
    ok("authorize non-member → 403 {ok:false}", nonMemberAuth.status === 403 && (await nonMemberAuth.json()).ok === false);

    const sendRoute = await messageRoute(internalReq("/api/internal/socket/message", { userId: sellerUser.id, conversationId: c1.id, body: "delivering shortly" }));
    const sendBody = await sendRoute.json();
    ok("message route persists + returns the saved row", sendRoute.status === 200 && sendBody.ok === true && sendBody.message?.body === "delivering shortly");
    const sendNonMember = await messageRoute(internalReq("/api/internal/socket/message", { userId: stranger.id, conversationId: c1.id, body: "sneaky" }));
    ok("message route rejects a non-member → 403", sendNonMember.status === 403);
    const sendEmpty = await messageRoute(internalReq("/api/internal/socket/message", { userId: buyer.id, conversationId: c1.id, body: "   " }));
    ok("message route rejects an empty body → 400", sendEmpty.status === 400);
    const sendNoAuth = await messageRoute(
      new Request("http://localhost/api/internal/socket/message", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userId: buyer.id, conversationId: c1.id, body: "hi" }),
      }),
    );
    ok("message route without secret → 401", sendNoAuth.status === 401);

    const readRouteRes = await readRoute(internalReq("/api/internal/socket/read", { userId: sellerUser.id, conversationId: c1.id }));
    ok("read route marks read → 200", readRouteRes.status === 200 && (await readRouteRes.json()).ok === true);
    ok("seller unread cleared after read route", (await countUnread(sellerUser.id)) === 0);

    console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  } finally {
    // Conversations must go before users (required buyer FK) — cascades messages.
    const userIds = [buyer.id, stranger.id, sellerUser.id];
    await db.conversation.deleteMany({
      where: { OR: [{ buyerId: { in: userIds } }, { sellerId: seller.id }] },
    });
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
