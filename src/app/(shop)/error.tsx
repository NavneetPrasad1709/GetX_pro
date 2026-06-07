"use client";

import { useEffect } from "react";
import { TriangleAlertIcon } from "lucide-react";
import { ctaVariants } from "@/components/shared/cta-link";
import { EmptyState } from "@/components/shared/empty-state";
import { PageContainer } from "@/components/shared/page-container";

/**
 * Shop-section error boundary — keeps a DB hiccup from white-screening the
 * whole app. Sentry wiring lands at Step 09 (per CLAUDE.md observability rule).
 */
export default function ShopError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[shop] render failed:", error);
  }, [error]);

  return (
    <main className="flex-1 py-12">
      <PageContainer>
        <EmptyState
          icon={<TriangleAlertIcon />}
          title="Something went wrong"
          description="We couldn't load this page. It's us, not you — please try again."
          action={
            <button type="button" onClick={reset} className={ctaVariants()}>
              Try again
            </button>
          }
        />
      </PageContainer>
    </main>
  );
}
