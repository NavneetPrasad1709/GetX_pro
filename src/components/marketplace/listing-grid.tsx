import { SearchXIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/shared/empty-state";
import { ListingCardSkeleton } from "@/components/marketplace/listing-card-skeleton";

/** Responsive marketplace grid: 2 cols on phones → 4 on desktop. */
export function ListingGrid({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4",
        className,
      )}
      {...props}
    />
  );
}

/** Skeleton grid while listings load. */
export function ListingGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <ListingGrid>
      {Array.from({ length: count }).map((_, i) => (
        <ListingCardSkeleton key={i} />
      ))}
    </ListingGrid>
  );
}

/** Zero-results state for the grid. */
export function ListingGridEmpty({
  title = "No listings yet",
  description = "Nothing here right now. Try a different game or check back soon.",
  action,
  headingLevel,
}: {
  title?: string;
  description?: string;
  action?: React.ReactNode;
  /** Forwarded to EmptyState — "h2" when this sits directly under the h1. */
  headingLevel?: "h2" | "h3";
}) {
  return (
    <EmptyState
      icon={<SearchXIcon />}
      title={title}
      description={description}
      action={action}
      headingLevel={headingLevel}
    />
  );
}
