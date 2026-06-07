import * as Sentry from "@sentry/nextjs";

/**
 * Sentry — edge runtime (middleware etc.) (Step 09). Same posture as the
 * server config: empty DSN = silent, no default PII.
 */
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
  tracesSampleRate: process.env.NODE_ENV === "development" ? 1.0 : 0.1,
});
