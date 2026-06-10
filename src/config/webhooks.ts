/**
 * Webhook source-IP allowlists (Step 32) — defense-in-depth ON TOP of the
 * signature/token verification each webhook route already does. A forged
 * request from a non-provider IP is dropped before we interpret the body.
 *
 * OPEN BY DEFAULT: an empty allowlist allows everything, so we never block real
 * webhooks before the provider IPs are configured. Set the env vars at launch
 * with each provider's published ranges (Razorpay & CoinGate list them in their
 * dashboards/docs). We warn once at boot when a list is empty so it's visible
 * that the guard isn't armed yet.
 *
 * CAVEAT: if webhook traffic passes through a proxy that rewrites the source IP
 * (e.g. Cloudflare orange-cloud), x-forwarded-for becomes the PROXY's IP, not
 * the provider's. Run the webhook routes DNS-only, or allowlist the proxy
 * egress IPs instead. See docs/DECISIONS.md (Step 32) + the launch checklist.
 */

export type WebhookProvider = "RAZORPAY" | "COINGATE";

function parseList(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

const ENV_KEY: Record<WebhookProvider, string> = {
  RAZORPAY: "RAZORPAY_WEBHOOK_IPS",
  COINGATE: "COINGATE_WEBHOOK_IPS",
};

// Boot-time visibility only — the actual check reads env FRESH per call (below)
// so config changes + tests take effect without a reimport.
for (const provider of Object.keys(ENV_KEY) as WebhookProvider[]) {
  if (parseList(process.env[ENV_KEY[provider]]).length === 0) {
    console.warn(
      `[webhooks] ${provider} IP allowlist empty — IP check disabled ` +
        `(set ${provider}_WEBHOOK_IPS at launch). Signature/token check still applies.`,
    );
  }
}

/**
 * The true client IP. Behind a Cloudflare orange-cloud proxy, x-forwarded-for[0]
 * is Cloudflare's EGRESS IP (not the provider's), which would wrongly fail the
 * allowlist — so prefer `CF-Connecting-IP` (Cloudflare's authoritative client IP)
 * when present, then the first x-forwarded-for hop, then x-real-ip.
 */
export function clientIpFromHeaders(headers: Headers): string {
  return (
    headers.get("cf-connecting-ip")?.trim() ||
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    headers.get("x-real-ip") ||
    "unknown"
  );
}

/** True if the IP is allowed (or the allowlist is empty → open by default). */
export function isWebhookIpAllowed(provider: WebhookProvider, ip: string): boolean {
  // Read env at CALL time (not module load) so the guard is testable + togglable.
  const list = parseList(process.env[ENV_KEY[provider]]);
  if (list.length === 0) return true; // open by default (warned at boot)
  return list.includes(ip);
}
