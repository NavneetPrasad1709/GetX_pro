import * as Sentry from "@sentry/nextjs";

/**
 * Next.js instrumentation hook (Step 09 — Sentry, guardrails §10: never run
 * payments blind). Loads the right Sentry runtime config on server boot.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("../sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("../sentry.edge.config");
  }
}

// Auto-captures UNCAUGHT errors from Server Components, route handlers and
// middleware. Caught-and-handled errors (webhooks, actions) call
// Sentry.captureException explicitly at the catch site.
export const onRequestError = Sentry.captureRequestError;
