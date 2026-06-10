import { createHmac, timingSafeEqual } from "crypto";

/**
 * Verifies the short-lived socket JWT minted by the GETX Next app. This is an
 * intentional COPY of src/lib/socket-token.ts's verifier — the two processes
 * share the SECRET, not the module (the socket server is a separate package
 * and must not import the app's code). Keep the two in sync.
 */

const ISSUER = "getx";
const AUDIENCE = "getx-socket";

export type SocketUser = {
  id: string;
  name: string | null;
  image: string | null;
};

export function createTokenVerifier(secret: string) {
  return function verify(token: string): SocketUser | null {
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

    const nowSec = Math.floor(Date.now() / 1000);
    if (claims.iss !== ISSUER || claims.aud !== AUDIENCE) return null;
    if (typeof claims.exp !== "number" || claims.exp < nowSec) return null;
    if (typeof claims.sub !== "string" || claims.sub.length === 0) return null;

    return {
      id: claims.sub,
      name: typeof claims.name === "string" ? claims.name : null,
      image: typeof claims.image === "string" ? claims.image : null,
    };
  };
}
