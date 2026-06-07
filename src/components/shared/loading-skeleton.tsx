import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type Variant =
  | "text"
  | "paragraph"
  | "title"
  | "avatar"
  | "button"
  | "stat"
  | "card";

type Props = {
  variant?: Variant;
  /** number of lines for text/paragraph variants */
  lines?: number;
  className?: string;
};

/**
 * One skeleton component, several shapes — keeps loading states consistent.
 * For listing grids use <ListingCardSkeleton /> in components/marketplace.
 */
export function LoadingSkeleton({
  variant = "text",
  lines = 3,
  className,
}: Props) {
  switch (variant) {
    case "avatar":
      return <Skeleton className={cn("size-9 rounded-full", className)} />;
    case "button":
      return <Skeleton className={cn("h-9 w-28 rounded-lg", className)} />;
    case "title":
      return <Skeleton className={cn("h-7 w-2/3 rounded-md", className)} />;
    case "stat":
      return (
        <div className={cn("flex flex-col gap-2", className)}>
          <Skeleton className="h-6 w-20 rounded-md" />
          <Skeleton className="h-3 w-14 rounded" />
        </div>
      );
    case "card":
      return (
        <div
          className={cn(
            "flex flex-col gap-3 rounded-2xl border border-border bg-card p-4",
            className,
          )}
        >
          <Skeleton className="aspect-[4/3] w-full rounded-lg" />
          <Skeleton className="h-4 w-3/4 rounded" />
          <Skeleton className="h-4 w-1/2 rounded" />
        </div>
      );
    case "paragraph":
    case "text":
    default:
      return (
        <div
          className={cn("flex flex-col gap-2", className)}
          aria-hidden="true"
        >
          {Array.from({ length: lines }).map((_, i) => (
            <Skeleton
              key={i}
              className={cn(
                "h-3.5 rounded",
                i === lines - 1 ? "w-2/3" : "w-full",
              )}
            />
          ))}
        </div>
      );
  }
}
