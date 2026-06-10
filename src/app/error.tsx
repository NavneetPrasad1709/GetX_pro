"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

/**
 * Route-segment error boundary (Step 31). Captures the error to Sentry + shows a branded fallback
 * with a reset action. (global-error.tsx handles errors in the root layout itself.)
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <div className="grid min-h-[60vh] place-items-center px-6 py-16 text-center">
      <div className="flex max-w-sm flex-col items-center gap-4">
        <span className="grid size-12 place-items-center rounded-full bg-primary/10 text-2xl">⚠️</span>
        <h2 className="font-heading text-2xl font-extrabold tracking-tight">Something went wrong</h2>
        <p className="text-sm text-muted-foreground">
          An unexpected error occurred and our team has been notified. Please try again.
        </p>
        <button
          type="button"
          onClick={() => reset()}
          className="rounded-sm bg-primary-strong px-5 py-2.5 font-heading text-sm font-bold text-primary-foreground transition-colors hover:bg-primary-strong-hover focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
