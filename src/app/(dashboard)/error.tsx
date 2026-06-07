"use client";

import { useEffect } from "react";
import { TriangleAlertIcon } from "lucide-react";
import { ctaVariants } from "@/components/shared/cta-link";
import { EmptyState } from "@/components/shared/empty-state";

/**
 * Dashboard-area error boundary — a transient Neon/service hiccup must show a
 * recoverable "try again", never white-screen the protected app.
 * Sentry wiring lands at Step 09 (per CLAUDE.md observability rule).
 */
export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[dashboard] render failed:", error);
  }, [error]);

  return (
    <EmptyState
      icon={<TriangleAlertIcon />}
      title="Something went wrong"
      description="We couldn't load this page. It's us, not you — please try again."
      headingLevel="h2"
      action={
        <button type="button" onClick={reset} className={ctaVariants()}>
          Try again
        </button>
      }
    />
  );
}
