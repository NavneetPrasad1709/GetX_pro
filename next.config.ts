import type { NextConfig } from "next";

/**
 * Security headers (audit fix — SECURITY_AUDIT_REPORT.md). These are the
 * non-breaking baseline: clickjacking, MIME-sniffing, referrer, permissions,
 * and the CSP directives that have NO inline-content fallback risk
 * (frame-ancestors / base-uri / object-src / form-action). A full nonce-based
 * script-src/style-src CSP needs proxy-injected nonces and lands in Step 32
 * (security hardening) so it can be runtime-verified against Turnstile + OAuth.
 *
 * HSTS + upgrade-insecure-requests are PROD-ONLY: on localhost (http) they
 * would force-upgrade subresources to https and break local dev.
 */
const isProd = process.env.NODE_ENV === "production";

const csp = [
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "object-src 'none'",
  "form-action 'self'",
  ...(isProd ? ["upgrade-insecure-requests"] : []),
].join("; ");

const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), browsing-topics=()",
  },
  { key: "Content-Security-Policy", value: csp },
  ...(isProd
    ? [
        {
          key: "Strict-Transport-Security",
          value: "max-age=63072000; includeSubDomains; preload",
        },
      ]
    : []),
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
