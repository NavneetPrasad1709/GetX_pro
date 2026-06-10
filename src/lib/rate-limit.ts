import { headers } from "next/headers";
import { Redis } from "@upstash/redis";
import { Ratelimit } from "@upstash/ratelimit";

/**
 * Rate limiting — two surfaces, one return shape.
 *
 * 1. `rateLimit()` — SYNCHRONOUS, fixed-window, in-memory. The MVP default,
 *    used at 25+ call sites. LIMITATION (accepted): state is per server
 *    instance — on serverless each warm lambda has its own map, so the real
 *    limit is a multiple of `limit`. Still stops naive brute force.
 *
 * 2. `rateLimitDistributed()` — ASYNC, sliding-window, backed by Upstash Redis
 *    when `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` are set. This is
 *    the GLOBAL limiter (shared across every serverless instance) — use it on
 *    the brute-forceable surface (login / register / password reset / payments)
 *    where per-instance counting isn't enough against distributed attacks.
 *
 *    ENV-SAFE: with no Upstash creds it falls back to the in-memory `rateLimit`
 *    above, so it behaves identically in dev and never crashes. The Redis creds
 *    are provisioned at launch (see docs — pre-launch checklist).
 *
 * Both return the same `RateLimitResult`, so callers branch on `.ok` either way.
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

// --- Upstash (distributed) --------------------------------------------------

/** Cached Redis client — undefined means "not yet resolved", null means "no creds". */
let redis: Redis | null | undefined;

function getRedis(): Redis | null {
  if (redis !== undefined) return redis;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  redis = url && token ? new Redis({ url, token }) : null;
  return redis;
}

/**
 * `Ratelimit` is bound to a fixed algorithm + window at construction, but our
 * callers pass different (limit, windowMs) combos. Cache one limiter per combo.
 */
const limiters = new Map<string, Ratelimit>();
// Distinct (limit, windowMs) combos are bounded by code (~8 call-site constants),
// so this never really grows — but cap it as a defense against an accidental
// dynamic config introducing unbounded entries.
const MAX_LIMITERS = 256;

function getLimiter(client: Redis, limit: number, windowMs: number): Ratelimit {
  const cacheKey = `${limit}:${windowMs}`;
  let limiter = limiters.get(cacheKey);
  if (!limiter) {
    if (limiters.size >= MAX_LIMITERS) limiters.clear();
    limiter = new Ratelimit({
      redis: client,
      // Sliding window = smoother than fixed window, no burst at the boundary.
      limiter: Ratelimit.slidingWindow(limit, `${windowMs} ms`),
      prefix: "getx:rl",
      analytics: false,
    });
    limiters.set(cacheKey, limiter);
  }
  return limiter;
}

/**
 * Global rate limit (Upstash when configured, else the in-memory limiter).
 * Same return shape as `rateLimit`. Fail-OPEN on infra error: a Redis hiccup
 * must never lock every user out — we fall back to the in-memory result, which
 * still provides per-instance protection.
 */
export async function rateLimitDistributed(
  key: string,
  opts: { limit: number; windowMs: number },
): Promise<RateLimitResult> {
  const client = getRedis();
  if (!client) return rateLimit(key, opts); // env-safe fallback

  try {
    const res = await getLimiter(client, opts.limit, opts.windowMs).limit(key);
    if (res.success) return { ok: true };
    const retryAfterSec = Math.max(1, Math.ceil((res.reset - Date.now()) / 1000));
    return { ok: false, retryAfterSec };
  } catch (err) {
    // Upstash unreachable → degrade to the local limiter, never throw.
    console.error("[rate-limit] Upstash error, falling back to in-memory", err);
    return rateLimit(key, opts);
  }
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
