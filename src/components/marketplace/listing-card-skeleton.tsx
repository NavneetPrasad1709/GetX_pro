import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/** Loading placeholder that matches <ListingCard /> dimensions exactly. */
export function ListingCardSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "flex flex-col overflow-hidden rounded-lg border border-border bg-card",
        className,
      )}
      aria-hidden="true"
    >
      <Skeleton className="aspect-[4/3] w-full rounded-none" />
      <div className="flex flex-col gap-2.5 p-3">
        <div className="flex items-center justify-between">
          <Skeleton className="h-3.5 w-12 rounded" />
          <Skeleton className="h-3.5 w-16 rounded" />
        </div>
        <Skeleton className="h-4 w-full rounded" />
        <Skeleton className="h-4 w-2/3 rounded" />
        <Skeleton className="h-6 w-20 rounded-md" />
        <div className="flex items-center gap-2 border-t border-border pt-2.5">
          <Skeleton className="size-6 rounded-full" />
          <Skeleton className="h-3.5 w-20 rounded" />
        </div>
      </div>
    </div>
  );
}
