/**
 * Step 11 LIVE end-to-end check — actually sends a message between two users
 * through the REAL stack: real socket auth token (mint → verify), the real
 * Socket.io relay (two socket.io-clients), real membership authorization, and
 * real DB persistence (chat service). Proves "a message sent by the buyer is
 * relayed to the seller in real time AND saved to the database".
 * Run: npx tsx scripts/qa-step11-live.ts
 */
import { createServer } from "http";
import type { AddressInfo } from "net";
import { io as ioClient, type Socket as ClientSocket } from "socket.io-client";
import { db } from "../src/lib/db";
import { mintSocketToken } from "../src/lib/socket-token";
import {
  getOrCreateConversation,
  isParticipant,
  markRead,
  persistMessage,
} from "../src/server/services/chat";
import { createSocketServer, type SocketDeps } from "../socket-server/src/server";
import { createTokenVerifier } from "../socket-server/src/auth";
import { createRateLimiter } from "../socket-server/src/rate-limit";

const SECRET = "qa11-live-secret";

function once<T>(s: ClientSocket, event: string, ms = 3000): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timeout: ${event}`)), ms);
    s.once(event, (d: T) => {
      clearTimeout(t);
      resolve(d);
    });
  });
}
function connect(url: string, token: string): Promise<ClientSocket> {
  return new Promise((resolve, reject) => {
    const s = ioClient(url, { auth: { token }, transports: ["websocket"], reconnection: false });
    s.on("connect", () => resolve(s));
    s.on("connect_error", reject);
  });
}
function emitAck(s: ClientSocket, ev: string, p: unknown): Promise<{ ok?: boolean }> {
  return new Promise((res) => s.emit(ev, p, res));
}

async function main() {
  const stamp = Date.now();
  const emails = { buyer: `live-buyer-${stamp}@test.getx.live`, seller: `live-seller-${stamp}@test.getx.live` };
  const buyer = await db.user.create({ data: { email: emails.buyer, name: "Aarav (buyer)", emailVerified: new Date() } });
  const sellerUser = await db.user.create({ data: { email: emails.seller, name: "Vortex (seller)", emailVerified: new Date() } });
  const seller = await db.sellerProfile.create({ data: { userId: sellerUser.id, displayName: "Vortex Store" } });
  const convo = await getOrCreateConversation(buyer.id, { sellerProfileId: seller.id });

  // Boot the REAL socket relay, wired to the REAL chat service (the only thing
  // stubbed-out vs prod is the HTTP hop to the internal API — qa-step11 covers that).
  const deps: SocketDeps = {
    allowedOrigin: "*",
    verifyToken: createTokenVerifier(SECRET),
    authorizeJoin: (userId, conversationId) => isParticipant(userId, conversationId),
    persistMessage: async (userId, conversationId, body) => {
      try {
        return await persistMessage(userId, conversationId, body);
      } catch {
        return { error: "rejected" };
      }
    },
    markRead: async (userId, conversationId) => {
      await markRead(userId, conversationId).catch(() => {});
    },
    rateLimit: createRateLimiter({ limit: 20, windowMs: 10_000 }),
    eventRateLimit: createRateLimiter({ limit: 60, windowMs: 10_000 }),
  };

  const httpServer = createServer();
  const io = createSocketServer(httpServer, deps);
  await new Promise<void>((r) => httpServer.listen(0, r));
  const url = `http://localhost:${(httpServer.address() as AddressInfo).port}`;

  const sockets: ClientSocket[] = [];
  try {
    console.log("\n🔌 Two users connecting to the realtime server…");
    const buyerToken = mintSocketToken({ sub: buyer.id, name: buyer.name, image: null }, SECRET);
    const sellerToken = mintSocketToken({ sub: sellerUser.id, name: sellerUser.name, image: null }, SECRET);
    const buyerSock = await connect(url, buyerToken);
    const sellerSock = await connect(url, sellerToken);
    sockets.push(buyerSock, sellerSock);
    console.log("   ✓ buyer connected   ✓ seller connected (both authenticated by token)");

    await emitAck(buyerSock, "conversation:join", { conversationId: convo.id });
    await emitAck(sellerSock, "conversation:join", { conversationId: convo.id });
    console.log("   ✓ both joined the conversation room\n");

    // 1) Buyer → Seller
    const sellerReceives = once<{ body: string; senderName: string | null }>(sellerSock, "message:new");
    await emitAck(buyerSock, "message:send", { conversationId: convo.id, body: "Hi! Is the Pokémon GO account still available? 👀", clientId: "live-1" });
    const got1 = await sellerReceives;
    console.log(`💬 buyer  → "${"Hi! Is the Pokémon GO account still available? 👀"}"`);
    console.log(`   seller received in real time → "${got1.body}"  (from ${got1.senderName})`);

    // 2) Seller → Buyer
    const buyerReceives = once<{ body: string; senderName: string | null }>(buyerSock, "message:new");
    await emitAck(sellerSock, "message:send", { conversationId: convo.id, body: "Yes! Level 40, escrow-protected. Buy now and I'll deliver in minutes. ⚡", clientId: "live-2" });
    const got2 = await buyerReceives;
    console.log(`💬 seller → "${"Yes! Level 40, escrow-protected. Buy now and I'll deliver in minutes. ⚡"}"`);
    console.log(`   buyer received in real time  → "${got2.body}"  (from ${got2.senderName})`);

    // Verify both messages actually persisted to the database.
    const saved = await db.message.findMany({
      where: { conversationId: convo.id },
      orderBy: { createdAt: "asc" },
      select: { body: true, senderId: true },
    });
    console.log(`\n🗄️  persisted in the database: ${saved.length} messages`);
    saved.forEach((m, i) => console.log(`   ${i + 1}. [${m.senderId === buyer.id ? "buyer" : "seller"}] ${m.body}`));

    const okRelay = got1.body.includes("still available") && got2.body.includes("Level 40");
    const okSaved = saved.length === 2;
    console.log(`\n${okRelay && okSaved ? "✅ PASS" : "❌ FAIL"} — messages relayed live AND saved. Reload would show the same history.`);
    if (!(okRelay && okSaved)) process.exitCode = 1;
  } finally {
    for (const s of sockets) s.close();
    io.close();
    httpServer.close();
    await db.conversation.deleteMany({ where: { id: convo.id } });
    await db.user.deleteMany({ where: { email: { in: Object.values(emails) } } });
    await db.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
