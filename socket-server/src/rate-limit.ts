/**
 * Per-socket fixed-window rate limiter for message sends (Step 11) — stops one
 * socket from flooding a room. In-memory (the socket server is a single
 * long-lived process), with opportunistic cleanup of expired buckets.
 */

type Bucket = { count: number; resetAt: number };

const MAX_KEYS = 100_000; // memory safety valve

export function createRateLimiter(opts: { limit: number; windowMs: number }) {
  const buckets = new Map<string, Bucket>();

  function check(key: string): boolean {
    const now = Date.now();

    if (buckets.size > MAX_KEYS) {
      for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k);
      if (buckets.size > MAX_KEYS) buckets.clear();
    }

    const bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + opts.windowMs });
      return true;
    }
    bucket.count += 1;
    return bucket.count <= opts.limit;
  }

  /** Drop a socket's bucket on disconnect so the map can't leak per connection. */
  function forget(key: string): void {
    buckets.delete(key);
  }

  return { check, forget };
}
