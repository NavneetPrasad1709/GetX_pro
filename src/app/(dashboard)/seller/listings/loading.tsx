import { Skeleton } from "@/components/ui/skeleton";

/** Listings manage skeleton — row shapes matching the real list. */
export default function SellerListingsLoading() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true">
      <p role="status" className="sr-only">
        Loading your listings…
      </p>
      <div aria-hidden="true" className="flex flex-col gap-4">
        <div>
          <Skeleton className="h-7 w-40 rounded" />
          <Skeleton className="mt-2 h-4 w-64 max-w-full rounded" />
        </div>
        <div className="flex flex-col gap-2.5">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4 min-[761px]:flex-row min-[761px]:items-center min-[761px]:justify-between"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <Skeleton className="h-5 w-14 rounded-full" />
                  <Skeleton className="h-4 w-16 rounded" />
                </div>
                <Skeleton className="mt-2 h-4 w-3/4 max-w-md rounded" />
                <Skeleton className="mt-1.5 h-3.5 w-56 max-w-full rounded" />
              </div>
              <div className="flex gap-1.5">
                <Skeleton className="h-7 w-16 rounded-sm" />
                <Skeleton className="h-7 w-20 rounded-sm" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
