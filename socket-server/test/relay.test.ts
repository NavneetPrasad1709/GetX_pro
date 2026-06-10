/**
 * Socket server relay test (Step 11). Boots the REAL createSocketServer with
 * STUBBED app deps (no DB / no Next app needed) on an ephemeral port, then drives
 * two socket.io-clients to verify: handshake auth, join authorization, room
 * relay, typing/read fan-out, and the per-socket send rate limit.
 * Run: npm run qa   (from socket-server/)
 */
import { createServer } from "http";
import type { AddressInfo } from "net";
import { io as ioClient, type Socket as ClientSocket } from "socket.io-client";
import { createSocketServer, type SocketDeps } from "../src/server";
import { createRateLimiter } from "../src/rate-limit";

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

// Membership: who may join which conversation (the stubbed app's answer).
const MEMBERSHIPS: Record<string, string[]> = {
  buyer1: ["convo1"],
  seller1: ["convo1"],
  // buyer2 is deliberately NOT a member of convo1
  buyer2: [],
};

const persistCalls: { userId: string; conversationId: string; body: string }[] = [];
const readCalls: { userId: string; conversationId: string }[] = [];

const deps: SocketDeps = {
  allowedOrigin: "*",
  verifyToken: (token) => {
    const m = /^valid:([a-z0-9]+):(.*)$/i.exec(token);
    return m ? { id: m[1], name: m[2] || null, image: null } : null;
  },
  authorizeJoin: async (userId, conversationId) =>
    MEMBERSHIPS[userId]?.includes(conversationId) ?? false,
  persistMessage: async (userId, conversationId, body) => {
    persistCalls.push({ userId, conversationId, body });
    return {
      id: `m${persistCalls.length}`,
      conversationId,
      senderId: userId,
      body,
      createdAt: new Date(0).toISOString(),
      senderName: null,
      senderImage: null,
    };
  },
  markRead: async (userId, conversationId) => {
    readCalls.push({ userId, conversationId });
  },
  rateLimit: createRateLimiter({ limit: 5, windowMs: 10_000 }),
  // Generous so it never interferes with the functional assertions above.
  eventRateLimit: createRateLimiter({ limit: 1000, windowMs: 10_000 }),
};

function connect(url: string, token: string): Promise<ClientSocket> {
  return new Promise((resolve, reject) => {
    const s = ioClient(url, {
      auth: { token },
      transports: ["websocket"],
      reconnection: false,
    });
    s.on("connect", () => resolve(s));
    s.on("connect_error", (err) => reject(err));
  });
}

function emitAck(s: ClientSocket, event: string, payload: unknown): Promise<{ ok?: boolean; error?: string }> {
  return new Promise((resolve) => s.emit(event, payload, resolve));
}

function once<T = unknown>(s: ClientSocket, event: string, timeoutMs = 1500): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timeout waiting for ${event}`)), timeoutMs);
    s.once(event, (data: T) => {
      clearTimeout(t);
      resolve(data);
    });
  });
}

/** Resolve true if `event` is NOT received within the window (e.g. no self-echo). */
function notReceived(s: ClientSocket, event: string, windowMs = 400): Promise<boolean> {
  return new Promise((resolve) => {
    let got = false;
    const h = () => {
      got = true;
    };
    s.on(event, h);
    setTimeout(() => {
      s.off(event, h);
      resolve(!got);
    }, windowMs);
  });
}

async function main() {
  const httpServer = createServer();
  const io = createSocketServer(httpServer, deps);
  await new Promise<void>((resolve) => httpServer.listen(0, resolve));
  const url = `http://localhost:${(httpServer.address() as AddressInfo).port}`;

  const sockets: ClientSocket[] = [];
  try {
    console.log("\n— handshake auth —");
    let rejected = false;
    try {
      const bad = await connect(url, "garbage-token");
      sockets.push(bad);
    } catch {
      rejected = true;
    }
    ok("unauthenticated socket rejected", rejected);

    const buyer = await connect(url, "valid:buyer1:Buyer One");
    const seller = await connect(url, "valid:seller1:Seller One");
    sockets.push(buyer, seller);
    ok("valid token connects", buyer.connected && seller.connected);

    console.log("\n— join authorization —");
    const joinOk = await emitAck(buyer, "conversation:join", { conversationId: "convo1" });
    ok("member joins their conversation", joinOk.ok === true, JSON.stringify(joinOk));
    const joinForbidden = await emitAck(buyer, "conversation:join", { conversationId: "convo9" });
    ok("non-member join rejected (forbidden)", joinForbidden.ok === false && joinForbidden.error === "forbidden");
    const joinBad = await emitAck(buyer, "conversation:join", { conversationId: "" });
    ok("malformed conversationId rejected", joinBad.ok === false && joinBad.error === "bad_request");

    await emitAck(seller, "conversation:join", { conversationId: "convo1" });

    console.log("\n— message relay —");
    const sellerGets = once<{ body: string; senderId: string; clientId?: string }>(seller, "message:new");
    const buyerGets = once<{ body: string; clientId?: string }>(buyer, "message:new");
    const sendAck = await emitAck(buyer, "message:send", {
      conversationId: "convo1",
      body: "gg wp",
      clientId: "tmp-1",
    });
    ok("send acked ok", sendAck.ok === true);
    const onSeller = await sellerGets;
    const onBuyer = await buyerGets;
    ok("other party receives message:new", onSeller.body === "gg wp" && onSeller.senderId === "buyer1");
    ok("sender receives broadcast with clientId (optimistic reconcile)", onBuyer.clientId === "tmp-1");
    ok("message persisted exactly once", persistCalls.length === 1 && persistCalls[0].body === "gg wp");

    console.log("\n— send without joining is forbidden —");
    const buyer2 = await connect(url, "valid:buyer2:Outsider");
    sockets.push(buyer2);
    const outsiderSend = await emitAck(buyer2, "message:send", { conversationId: "convo1", body: "let me in" });
    ok("non-joined socket cannot send to a room", outsiderSend.ok === false && outsiderSend.error === "forbidden");
    ok("no extra persist from the outsider", persistCalls.length === 1);

    console.log("\n— typing + read fan-out —");
    const sellerTyping = once<{ userId: string; isTyping: boolean }>(seller, "typing");
    const buyerNoSelfTyping = notReceived(buyer, "typing");
    buyer.emit("typing", { conversationId: "convo1", isTyping: true });
    const typingEvt = await sellerTyping;
    ok("typing relayed to the other party", typingEvt.userId === "buyer1" && typingEvt.isTyping === true);
    ok("typing is NOT echoed back to the sender", await buyerNoSelfTyping);

    const sellerRead = once<{ userId: string; conversationId: string }>(seller, "read");
    buyer.emit("message:read", { conversationId: "convo1" });
    const readEvt = await sellerRead;
    ok("read receipt relayed to the other party", readEvt.userId === "buyer1" && readEvt.conversationId === "convo1");
    ok("markRead persisted", readCalls.some((c) => c.userId === "buyer1" && c.conversationId === "convo1"));

    console.log("\n— per-socket send rate limit —");
    const spammer = await connect(url, "valid:buyer1:Spammer");
    sockets.push(spammer);
    await emitAck(spammer, "conversation:join", { conversationId: "convo1" });
    const results: Array<{ ok?: boolean; error?: string }> = [];
    for (let i = 0; i < 7; i++) {
      results.push(await emitAck(spammer, "message:send", { conversationId: "convo1", body: `spam ${i}` }));
    }
    const limited = results.filter((r) => r.error === "rate_limited").length;
    ok("rate limit kicks in after the cap (5/window)", limited >= 1, `limited=${limited}`);

    console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  } finally {
    for (const s of sockets) s.close();
    io.close();
    httpServer.close();
  }
  if (fail > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
