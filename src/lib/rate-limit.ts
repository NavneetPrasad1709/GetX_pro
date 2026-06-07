import { headers } from "next/headers";

/**
 * Minimal fixed-window in-memory rate limiter for auth/write endpoints.
 *
 * LIMITATION (accepted at MVP): state is per server instance — on serverless
 * each warm lambda has its own map, so the real-world limit is a multiple of
 * `limit`. Still stops naive brute force. Swap for Upstash/Redis at Step 32
 * (security hardening) without changing call sites.
 */

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();
const MAX_BUCKETS = 50_000; // memory safety valve

export type RateLimitResult = { ok: true } | { ok: false; retryAfterSec: number };

export function rateLimit(
  key: string,
  opts: { limit: number; windowMs: number },
): RateLimitResult {
  const now = Date.now();

  // Opportunistic cleanup so the map can't grow without bound.
  if (buckets.size > MAX_BUCKETS) {
    for (const [k, b] of buckets) {
      if (b.resetAt <= now) buckets.delete(k);
    }
    if (buckets.size > MAX_BUCKETS) buckets.clear(); // last resort
  }

  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + opts.windowMs });
    return { ok: true };
  }

  bucket.count += 1;
  if (bucket.count > opts.limit) {
    return {
      ok: false,
      retryAfterSec: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
    };
  }
  return { ok: true };
}

/** Best-effort client IP (Vercel/Railway set x-forwarded-for). */
export async function getClientIp(): Promise<string> {
  const h = await headers();
  return (
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    h.get("x-real-ip") ||
    "unknown"
  );
}
