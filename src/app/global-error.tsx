"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

/**
 * App Router global error boundary (required for Sentry to see React render
 * crashes). Replaces the ROOT layout when it renders, so it must own its own
 * <html>/<body>. Styling is inline-minimal on purpose — if we're here, the
 * design system itself may have failed to load.
 */
export default function GlobalError({
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
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          background: "#0a0a0f",
          color: "#fafafa",
          fontFamily: "system-ui, sans-serif",
          textAlign: "center",
          padding: "1.5rem",
        }}
      >
        <div>
          <h1 style={{ fontSize: "1.25rem", marginBottom: "0.5rem" }}>
            Something went wrong
          </h1>
          <p style={{ opacity: 0.7, fontSize: "0.875rem", marginBottom: "1rem" }}>
            The error has been reported. Please try again.
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              background: "#4d7cfe",
              color: "#fff",
              border: 0,
              borderRadius: "0.375rem",
              padding: "0.6rem 1.2rem",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
