import { auth } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { mintSocketToken } from "@/lib/socket-token";

/**
 * Mints a short-lived socket auth token for the LOGGED-IN user (Step 11). The
 * chat client fetches this, then opens the websocket with it in the handshake.
 * Session-authed (the normal Auth.js cookie); never returns a token to anon.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(): Promise<Response> {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Per-user cap: the socket send limit is keyed on socket.id, so unthrottled
  // token minting would let one user churn fresh sockets to bypass it. A modest
  // cap still allows legitimate reconnect-driven re-mints.
  const rl = rateLimit(`socket-token:${session.user.id}`, { limit: 30, windowMs: 60_000 });
  if (!rl.ok) {
    return Response.json(
      { error: "Too many requests" },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } },
    );
  }

  const secret = process.env.SOCKET_AUTH_SECRET;
  const url = process.env.NEXT_PUBLIC_SOCKET_URL;
  // Chat not configured (no socket server) → clean 503, never a 500.
  if (!secret || !url) {
    return Response.json({ error: "Chat is not available right now." }, { status: 503 });
  }

  const token = mintSocketToken(
    {
      sub: session.user.id,
      name: session.user.name ?? null,
      image: session.user.image ?? null,
    },
    secret,
  );
  return Response.json({ token, url });
}
