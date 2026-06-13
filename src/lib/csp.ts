/**
 * Content-Security-Policy builder (Step 32).
 *
 * Two policies, one builder:
 *   - PUBLIC / ISR routes get the no-nonce policy. It keeps `'unsafe-inline'`
 *     for scripts so those pages can stay statically rendered + CDN-cached
 *     (a nonce would force dynamic rendering and kill ISR — and SEO/speed is
 *     this project's whole strategy, see CLAUDE.md).
 *   - SENSITIVE / dynamic routes (dashboard, seller, admin, checkout, orders,
 *     messages, auth) get a per-request nonce + `'strict-dynamic'`. Those routes
 *     are already dynamic, so there's no ISR to lose, and they're the highest
 *     XSS-value surface (authenticated, money, PII).
 *
 * `'strict-dynamic'` makes modern browsers ignore the host allowlist AND
 * `'unsafe-inline'` for scripts — only nonce'd scripts (and what they load)
 * run. The host/`unsafe-inline` entries stay as a CSP2 fallback for old
 * browsers. So one builder serves both cases cleanly.
 *
 * Edge-safe: pure string building + process.env reads only (runs in middleware).
 */

/** Pull the origin (scheme://host[:port]) from a URL env var, or null. */
function originOf(raw: string | undefined): string | null {
  if (!raw) return null;
  try {
    return new URL(raw).origin;
  } catch {
    // A malformed env URL silently drops its origin from connect-src; warn so a
    // misconfigured Sentry/socket origin is debuggable instead of mysteriously blocked.
    console.warn(`[csp] ignoring unparseable origin URL: ${raw}`);
    return null;
  }
}

/** A list with falsy entries dropped and duplicates removed, space-joined. */
function tokens(...parts: Array<string | null | undefined | false>): string {
  return Array.from(new Set(parts.filter(Boolean) as string[])).join(" ");
}

export function buildCsp(opts: { nonce?: string; isDev: boolean }): string {
  const { nonce, isDev } = opts;

  // External origins we legitimately talk to — included only when configured.
  const posthog = "https://*.posthog.com"; // ingest + assets (only loaded if a key is set client-side)
  const sentry = originOf(process.env.NEXT_PUBLIC_SENTRY_DSN);
  const socketHttp = originOf(process.env.NEXT_PUBLIC_SOCKET_URL);
  const socketWs = socketHttp ? socketHttp.replace(/^http/, "ws") : null;
  const turnstile = "https://challenges.cloudflare.com";
  const razorpay = "https://*.razorpay.com";
  const sumsub = "https://*.sumsub.com"; // Sumsub KYC: SDK iframe + API + static assets
  const sumsubWs = "wss://*.sumsub.com"; // Sumsub SDK websocket

  const scriptSrc = tokens(
    "'self'",
    nonce ? `'nonce-${nonce}'` : null,
    nonce ? "'strict-dynamic'" : null,
    "'unsafe-inline'", // CSP2 fallback; ignored by modern browsers when a nonce/strict-dynamic is present
    isDev ? "'unsafe-eval'" : null, // Next.js dev HMR needs eval
    turnstile,
    razorpay,
    sumsub,
  );

  const connectSrc = tokens(
    "'self'",
    posthog,
    sentry,
    socketHttp,
    socketWs,
    razorpay,
    sumsub,
    sumsubWs,
    isDev ? "ws://localhost:*" : null,
    isDev ? "http://localhost:*" : null,
  );

  const directives = [
    `default-src 'self'`,
    `script-src ${scriptSrc}`,
    `style-src 'self' 'unsafe-inline'`, // Tailwind + inline styles
    `img-src 'self' data: blob: https:`, // R2, avatars, OG, data URIs
    `font-src 'self' data:`,
    `connect-src ${connectSrc}`,
    `frame-src 'self' ${turnstile} ${razorpay} ${sumsub}`, // Turnstile + Razorpay + Sumsub KYC iframe
    `worker-src 'self' blob:`, // service worker + web workers
    `manifest-src 'self'`,
    `media-src 'self' blob:`, // blob: for Sumsub liveness / camera capture
    `object-src 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `frame-ancestors 'none'`,
    ...(isDev ? [] : ["upgrade-insecure-requests"]),
  ];

  return directives.join("; ");
}
