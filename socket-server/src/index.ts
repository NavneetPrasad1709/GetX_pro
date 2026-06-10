import { createServer, type IncomingMessage, type ServerResponse } from "http";
import { timingSafeEqual } from "node:crypto";
import { loadEnv } from "./env";
import { createTokenVerifier } from "./auth";
import { createAppClient } from "./app-client";
import { createRateLimiter } from "./rate-limit";
import { createSocketServer, userRoomOf } from "./server";

/**
 * GETX realtime chat server entrypoint (Step 11). Loads env, wires the real
 * collaborators (token verifier, app internal-API client, rate limiter) into the
 * thin Socket.io relay, and exposes a /health route for Railway.
 *
 * Step 22 adds an authenticated `POST /notify` route: the Next app pushes
 * notification events here and we emit `notification:new` to the user's private
 * `user:<id>` room.
 */

// Load .env in local dev (Node ≥20.12). On Railway env vars are injected, so a
// missing file is fine — swallow it.
try {
  (process as { loadEnvFile?: (path?: string) => void }).loadEnvFile?.();
} catch {
  /* no .env file (e.g. production) — env is already in process.env */
}

const env = loadEnv();

// Assigned once createSocketServer runs; the request handler closes over it and
// only reads it at request time (always after assignment).
let io: ReturnType<typeof createSocketServer> | undefined;

/** Constant-time bearer check for /notify — mirrors the app's isInternalRequest. */
function isAuthorizedNotify(req: IncomingMessage): boolean {
  const secret = env.internalApiSecret;
  if (!secret) return false; // fail closed
  const provided = req.headers["authorization"] ?? "";
  const expected = `Bearer ${secret}`;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Emit a notification (forwarded by the app) to the recipient's private room. */
function handleNotify(req: IncomingMessage, res: ServerResponse): void {
  if (!isAuthorizedNotify(req)) {
    res.writeHead(401, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: false, error: "unauthorized" }));
    return;
  }
  let raw = "";
  let aborted = false;
  req.on("data", (chunk) => {
    raw += chunk;
    if (raw.length > 16_000) {
      aborted = true;
      res.writeHead(413, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: false, error: "payload_too_large" }));
      req.destroy();
    }
  });
  req.on("end", () => {
    if (aborted) return;
    try {
      const parsed = JSON.parse(raw) as { userId?: unknown; notification?: unknown };
      const userId = typeof parsed.userId === "string" ? parsed.userId : null;
      if (
        !userId ||
        typeof parsed.notification !== "object" ||
        parsed.notification === null
      ) {
        res.writeHead(400, { "content-type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: "bad_request" }));
        return;
      }
      io?.to(userRoomOf(userId)).emit("notification:new", parsed.notification);
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
    } catch {
      res.writeHead(400, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: false, error: "bad_json" }));
    }
  });
}

const httpServer = createServer((req: IncomingMessage, res: ServerResponse) => {
  if (req.method === "POST" && req.url === "/notify") {
    handleNotify(req, res);
    return;
  }
  if (req.url === "/health" || req.url === "/") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true, service: "getx-socket-server" }));
    return;
  }
  res.writeHead(404, { "content-type": "application/json" });
  res.end(JSON.stringify({ ok: false, error: "not_found" }));
});

const app = createAppClient(env.appUrl, env.internalApiSecret);
// 20 messages / 10s per socket — generous for humans, stops send floods.
const sendLimiter = createRateLimiter({ limit: 20, windowMs: 10_000 });
// Looser cap for the cheap-but-DB/CPU-touching events (join/read/typing) so one
// socket can't flood internal API + DB round-trips. Separate budget from sends.
const eventLimiter = createRateLimiter({ limit: 60, windowMs: 10_000 });

io = createSocketServer(httpServer, {
  allowedOrigin: env.allowedOrigin,
  verifyToken: createTokenVerifier(env.socketAuthSecret),
  authorizeJoin: app.authorizeJoin,
  persistMessage: app.persistMessage,
  markRead: app.markRead,
  rateLimit: sendLimiter,
  eventRateLimit: eventLimiter,
});

httpServer.listen(env.port, () => {
  console.log(
    `[socket-server] listening on :${env.port} · origin ${env.allowedOrigin} · app ${env.appUrl}`,
  );
});
