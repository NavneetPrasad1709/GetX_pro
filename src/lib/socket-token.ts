import { createHmac, timingSafeEqual } from "crypto";

/**
 * Short-lived HS256 JWT used ONLY to authenticate a websocket handshake to the
 * standalone Socket.io server (Step 11). The Next app mints it for the logged-in
 * user; the socket server verifies it with the SAME shared `SOCKET_AUTH_SECRET`.
 *
 * Why a dedicated token (not the Auth.js cookie): the socket server is a separate
 * Railway process and must NOT depend on Auth.js internals or read our cookies.
 * A tiny, self-contained crypto JWT keeps the socket server dependency-free.
 * Pure Node `crypto` — no jose — so the exact same code runs on both sides.
 */

const ISSUER = "getx";
const AUDIENCE = "getx-socket";
const TTL_SECONDS = 5 * 60; // 5 min — only needs to survive the handshake

export type SocketTokenClaims = {
  /** the authenticated user id */
  sub: string;
  name: string | null;
  image: string | null;
};

function b64url(input: string): string {
  return Buffer.from(input, "utf8").toString("base64url");
}

/** Mint a 5-minute token proving who the connecting user is. */
export function mintSocketToken(
  claims: SocketTokenClaims,
  secret: string,
  nowSec: number = Math.floor(Date.now() / 1000),
): string {
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = b64url(
    JSON.stringify({
      sub: claims.sub,
      name: claims.name,
      image: claims.image,
      iss: ISSUER,
      aud: AUDIENCE,
      iat: nowSec,
      exp: nowSec + TTL_SECONDS,
    }),
  );
  const data = `${header}.${payload}`;
  const sig = createHmac("sha256", secret).update(data).digest("base64url");
  return `${data}.${sig}`;
}

/**
 * Verify signature + iss/aud + expiry in constant time. Returns the claims, or
 * null for anything malformed / forged / expired. (The socket server holds an
 * identical copy of this verifier — they share the secret, not the module.)
 */
export function verifySocketToken(
  token: string,
  secret: string,
  nowSec: number = Math.floor(Date.now() / 1000),
): SocketTokenClaims | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [header, payload, sig] = parts;

  const expected = createHmac("sha256", secret)
    .update(`${header}.${payload}`)
    .digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  let claims: Record<string, unknown>;
  try {
    claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (claims.iss !== ISSUER || claims.aud !== AUDIENCE) return null;
  if (typeof claims.exp !== "number" || claims.exp < nowSec) return null;
  if (typeof claims.sub !== "string" || claims.sub.length === 0) return null;

  return {
    sub: claims.sub,
    name: typeof claims.name === "string" ? claims.name : null,
    image: typeof claims.image === "string" ? claims.image : null,
  };
}
