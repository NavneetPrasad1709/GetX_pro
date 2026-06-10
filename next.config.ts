import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";
import bundleAnalyzer from "@next/bundle-analyzer";

const withBundleAnalyzer = bundleAnalyzer({ enabled: process.env.ANALYZE === "true" });

/**
 * Security headers (audit fix + Step 32). Clickjacking, MIME-sniffing,
 * referrer, permissions and HSTS live here so they cover EVERY response
 * (HTML, API, assets). The Content-Security-Policy is NOT here — it's emitted
 * per-route by the Edge proxy (src/proxy.ts) so it can carry a per-request
 * nonce on sensitive routes while staying nonce-free (and ISR-cacheable) on
 * public ones. Keeping it in exactly one place avoids two CSP headers being
 * intersected into a broken policy.
 *
 * HSTS is PROD-ONLY: on localhost (http) preload/upgrade would break dev.
 */
const isProd = process.env.NODE_ENV === "production";

const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), browsing-topics=()",
  },
  ...(isProd
    ? [
        {
          key: "Strict-Transport-Security",
          value: "max-age=63072000; includeSubDomains; preload",
        },
      ]
    : []),
];

/**
 * Allow next/image to optimize listing images served from the R2 public bucket.
 * Requires R2_PUBLIC_BASE_URL to be set at BUILD time (Vercel env var).
 * Without it, <Image> optimization silently falls back to unoptimized delivery
 * for all listing images — CLS risk if images load without known dimensions.
 * Set R2_PUBLIC_BASE_URL in .env.example and in all Vercel environment configs
 * (production + preview + development) before any listing images go live.
 */
function r2RemotePatterns(): NonNullable<NextConfig["images"]>["remotePatterns"] {
  const base = process.env.R2_PUBLIC_BASE_URL;
  if (!base) return [];
  try {
    const u = new URL(base);
    return [
      {
        protocol: u.protocol.replace(":", "") as "http" | "https",
        hostname: u.hostname,
      },
    ];
  } catch {
    return [];
  }
}

const nextConfig: NextConfig = {
  images: {
    remotePatterns: r2RemotePatterns(),
    // Serve modern formats (Step 33) — AVIF/WebP are far smaller than JPEG/PNG,
    // which directly improves LCP on the image-heavy marketplace/listing pages.
    formats: ["image/avif", "image/webp"],
  },
  async headers() {
    return [
      // PWA (Step 24): the SW must control the whole origin and must never be stale-cached.
      {
        source: "/sw.js",
        headers: [
          { key: "Service-Worker-Allowed", value: "/" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
        ],
      },
      { source: "/:path*", headers: securityHeaders },
    ];
  },
};

// Sentry (Step 09). Source-map upload happens only when SENTRY_AUTH_TOKEN +
// org/project are present at BUILD time (CI/Vercel) — optional; without it
// errors still arrive, just with minified stack traces.
// withBundleAnalyzer wraps outermost so ANALYZE=true next build opens the report.
export default withBundleAnalyzer(withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: !process.env.CI,
}));
