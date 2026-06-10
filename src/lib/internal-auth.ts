import { timingSafeEqual } from "crypto";

/**
 * Server-to-server auth for the internal API the Socket.io server calls
 * (Step 11). The socket server sends `Authorization: Bearer ${INTERNAL_API_SECRET}`;
 * we verify it in constant time and FAIL CLOSED when the secret is unset, so
 * these routes can never be hit by the public internet without the shared secret.
 */
export function isInternalRequest(req: Request): boolean {
  const secret = process.env.INTERNAL_API_SECRET;
  if (!secret) return false; // fail closed — no secret configured ⇒ reject all
  const provided = req.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
