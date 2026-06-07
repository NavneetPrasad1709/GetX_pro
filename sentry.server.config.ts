import * as Sentry from "@sentry/nextjs";

/**
 * Sentry — Node.js server runtime (Step 09). An empty DSN (local dev default)
 * means the SDK initializes but sends NOTHING — no special-casing needed.
 * PII stays off: no request headers / IPs attached (sendDefaultPii defaults
 * to false), and payment payloads are never logged anywhere.
 */
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
  // Errors are always captured at 100% — this only samples performance traces.
  tracesSampleRate: process.env.NODE_ENV === "development" ? 1.0 : 0.1,
});
