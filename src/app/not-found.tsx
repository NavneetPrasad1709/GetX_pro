import type { Metadata } from "next";
import Link from "next/link";
import { CompassIcon } from "lucide-react";
import { CtaLink } from "@/components/shared/cta-link";
import { EmptyState } from "@/components/shared/empty-state";
import { PageContainer } from "@/components/shared/page-container";

export const metadata: Metadata = {
  title: "Page not found",
  description: "The page you're looking for doesn't exist on GETX.",
};

/** Branded 404 — shown for unknown routes, games, and categories. */
export default function NotFound() {
  return (
    <main className="flex-1 py-12">
      <PageContainer>
        <EmptyState
          icon={<CompassIcon />}
          title="Page not found"
          description="This page doesn't exist (or was removed). Let's get you back to the marketplace."
          action={
            <div className="flex flex-wrap items-center justify-center gap-2.5">
              <CtaLink href="/games">Browse games</CtaLink>
              <Link
                href="/"
                className="inline-flex items-center justify-center rounded-sm border border-border bg-card px-[18px] py-[11px] font-heading text-[14.5px] font-semibold text-muted-foreground transition-colors duration-150 hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
              >
                Go home
              </Link>
            </div>
          }
        />
      </PageContainer>
    </main>
  );
}
