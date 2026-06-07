import * as Sentry from "@sentry/nextjs";

/**
 * Sentry — browser SDK (Step 09). This file is the CURRENT pattern (it
 * replaces the deprecated sentry.client.config.ts). The DSN is public by
 * design (NEXT_PUBLIC_); an empty one disables sending entirely. Session
 * Replay is intentionally OFF (bundle weight + PII caution on a marketplace).
 */
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: process.env.NODE_ENV === "development" ? 1.0 : 0.1,
});

// Instruments App Router navigations for tracing.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
