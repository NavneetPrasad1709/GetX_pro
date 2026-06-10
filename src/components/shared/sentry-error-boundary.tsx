"use client";

import { ErrorBoundary } from "@sentry/nextjs";

/**
 * Sentry error boundary (Step 31) — wraps high-risk surfaces (listing, checkout, dashboard). Errors
 * are reported to Sentry automatically; the fallback is intentionally generic (shows NO order/payment
 * details, which may be in an invalid state) with a reload action.
 */
export { ErrorBoundary as SentryErrorBoundary };

export function DefaultFallback() {
  return (
    <div className="grid min-h-[50vh] place-items-center px-6 py-12 text-center">
      <div className="flex max-w-sm flex-col items-center gap-4">
        <span className="grid size-12 place-items-center rounded-full bg-primary/10 text-2xl">⚠️</span>
        <h2 className="font-heading text-xl font-bold tracking-tight">Something went wrong</h2>
        <p className="text-sm text-muted-foreground">
          An unexpected error occurred and our team has been notified. Please try again.
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="rounded-sm bg-primary-strong px-5 py-2.5 font-heading text-sm font-bold text-primary-foreground transition-colors hover:bg-primary-strong-hover focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
