// PRIVACY (Step 31): only IDs and integer amounts are sent as event properties.
// NEVER include name, email, phone, IP, or any other PII. `$ip: null` is forced on every event.
// See docs/DECISIONS.md Step 31 for the PII policy.
import { PostHog } from "posthog-node";

/**
 * Server-side PostHog singleton (Step 31). Env-safe: with no NEXT_PUBLIC_POSTHOG_KEY this returns
 * null and every capture is a silent no-op (same pattern as Sentry/Algolia/Sumsub). `flushAt: 1`
 * + `flushInterval: 0` make each event flush before a serverless function freezes.
 */
let cached: PostHog | null | undefined;

export function getPostHogServer(): PostHog | null {
  if (cached !== undefined) return cached;
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  const host = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://app.posthog.com";
  cached = key ? new PostHog(key, { host, flushAt: 1, flushInterval: 0 }) : null;
  return cached;
}

/**
 * Fire-and-forget server event capture. Null-safe + never throws into the caller (analytics must
 * never break a money/render path). IP is stripped; pass only IDs + amounts in `properties`.
 */
export function captureServerEvent(
  event: string,
  distinctId: string,
  properties: Record<string, string | number | boolean | null>,
): void {
  try {
    getPostHogServer()?.capture({
      distinctId,
      event,
      properties: { ...properties, $ip: null },
    });
  } catch {
    /* analytics is best-effort — swallow */
  }
}
