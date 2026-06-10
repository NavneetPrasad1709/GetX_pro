import type { Server as HttpServer } from "http";
import { Server, type Socket, type DefaultEventsMap } from "socket.io";
import type { SocketUser } from "./auth";
import type { PersistResult } from "./app-client";

/**
 * The Socket.io wiring (Step 11) — deliberately THIN: authenticate the socket,
 * manage one room per conversation, relay events, persist via injected deps.
 * No DB, no business rules here. `createSocketServer` takes its collaborators as
 * arguments so the relay logic is unit-testable with stubs (see test/).
 *
 * Authorization model:
 *   • handshake     → verifyToken proves WHO the socket is (rejected otherwise).
 *   • conversation:join → authorizeJoin proves membership before the socket can
 *     receive a room's broadcasts.
 *   • message:send  → must already be IN the room (joined ⇒ authorized) AND the
 *     app re-checks membership at persist time (authoritative). Rate-limited.
 */

export type SocketDeps = {
  allowedOrigin: string;
  verifyToken: (token: string) => SocketUser | null;
  authorizeJoin: (userId: string, conversationId: string) => Promise<boolean>;
  persistMessage: (
    userId: string,
    conversationId: string,
    body: string,
  ) => Promise<PersistResult>;
  markRead: (userId: string, conversationId: string) => Promise<void>;
  /** Throttles message:send (creates new data). */
  rateLimit: { check: (key: string) => boolean; forget: (key: string) => void };
  /** Looser throttle for the cheap-but-DB/CPU-touching events (join/read/typing). */
  eventRateLimit: { check: (key: string) => boolean; forget: (key: string) => void };
};

type SocketData = { user: SocketUser };

// Use Socket.io's permissive default event maps (we validate every payload at
// runtime) and only specialise the typed per-socket `data`.
type IOServer = Server<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, SocketData>;
type IOSocket = Socket<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, SocketData>;

const MAX_BODY_CHARS = 8000; // coarse DoS guard; the app enforces the real 2000

const roomOf = (conversationId: string) => `conversation:${conversationId}`;
/** Private per-user room — notifications are emitted here (Step 22). */
export const userRoomOf = (userId: string) => `user:${userId}`;

/** Accept only cuid-shaped ids from the wire. */
function readId(value: unknown): string | null {
  return typeof value === "string" && /^[a-z0-9]{1,64}$/i.test(value) ? value : null;
}

type Ack = ((response: unknown) => void) | undefined;
function ackOk(ack: Ack, extra: Record<string, unknown> = {}): void {
  if (typeof ack === "function") ack({ ok: true, ...extra });
}
function ackErr(ack: Ack, error: string, extra: Record<string, unknown> = {}): void {
  if (typeof ack === "function") ack({ ok: false, error, ...extra });
}

export function createSocketServer(
  httpServer: HttpServer,
  deps: SocketDeps,
): Server {
  const io: IOServer = new Server(httpServer, {
    cors: { origin: deps.allowedOrigin, methods: ["GET", "POST"], credentials: true },
    // Drop dead connections reasonably fast; clients auto-reconnect.
    pingTimeout: 20_000,
  });

  // Handshake auth — reject any socket without a valid short-lived token.
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (typeof token !== "string") return next(new Error("unauthorized"));
    const user = deps.verifyToken(token);
    if (!user) return next(new Error("unauthorized"));
    socket.data.user = user;
    next();
  });

  io.on("connection", (socket: IOSocket) => {
    const user = socket.data.user;

    // Join the socket's own private room so the app can push notifications to it
    // (Step 22). Authorization is implicit: the handshake already proved WHO this
    // socket is, and a socket can only ever be in its own user:<id> room.
    void socket.join(userRoomOf(user.id));

    socket.on("conversation:join", async (payload: { conversationId?: unknown }, ack: Ack) => {
      const conversationId = readId(payload?.conversationId);
      if (!conversationId) return ackErr(ack, "bad_request");
      // Throttle: each join is a DB membership lookup, even when rejected.
      if (!deps.eventRateLimit.check(socket.id)) return ackErr(ack, "rate_limited");
      const allowed = await deps.authorizeJoin(user.id, conversationId).catch(() => false);
      if (!allowed) return ackErr(ack, "forbidden");
      await socket.join(roomOf(conversationId));
      ackOk(ack, { conversationId });
    });

    socket.on("conversation:leave", (payload: { conversationId?: unknown }) => {
      const conversationId = readId(payload?.conversationId);
      if (conversationId) socket.leave(roomOf(conversationId));
    });

    socket.on("message:send", async (payload: { conversationId?: unknown; body?: unknown; clientId?: unknown }, ack: Ack) => {
      const conversationId = readId(payload?.conversationId);
      const body = typeof payload?.body === "string" ? payload.body : "";
      const clientId = typeof payload?.clientId === "string" ? payload.clientId : undefined;
      if (!conversationId || body.trim().length === 0 || body.length > MAX_BODY_CHARS) {
        return ackErr(ack, "bad_request", { clientId });
      }
      // Must have joined (⇒ been authorized for) this room.
      if (!socket.rooms.has(roomOf(conversationId))) return ackErr(ack, "forbidden", { clientId });
      // Spam guard, per socket.
      if (!deps.rateLimit.check(socket.id)) return ackErr(ack, "rate_limited", { clientId });

      const result = await deps
        .persistMessage(user.id, conversationId, body)
        .catch(() => ({ error: "server_error" }) as PersistResult);
      if ("error" in result) return ackErr(ack, result.error, { clientId });

      // Broadcast the authoritative saved row to everyone in the room (incl. the
      // sender, who reconciles its optimistic copy via clientId).
      io.to(roomOf(conversationId)).emit("message:new", { ...result, clientId });
      ackOk(ack, { message: result, clientId });
    });

    socket.on("typing", (payload: { conversationId?: unknown; isTyping?: unknown }) => {
      const conversationId = readId(payload?.conversationId);
      if (!conversationId || !socket.rooms.has(roomOf(conversationId))) return;
      if (!deps.eventRateLimit.check(socket.id)) return; // cosmetic — safe to drop
      socket.to(roomOf(conversationId)).emit("typing", {
        userId: user.id,
        name: user.name,
        isTyping: Boolean(payload?.isTyping),
      });
    });

    socket.on("message:read", async (payload: { conversationId?: unknown }) => {
      const conversationId = readId(payload?.conversationId);
      if (!conversationId || !socket.rooms.has(roomOf(conversationId))) return;
      // Throttle: each read drives an internal POST + a DB write (markRead).
      if (!deps.eventRateLimit.check(socket.id)) return;
      await deps.markRead(user.id, conversationId).catch(() => {});
      socket.to(roomOf(conversationId)).emit("read", { userId: user.id, conversationId });
    });

    socket.on("disconnect", () => {
      deps.rateLimit.forget(socket.id);
      deps.eventRateLimit.forget(socket.id);
    });
  });

  return io;
}
