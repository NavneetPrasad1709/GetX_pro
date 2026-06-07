import { Skeleton } from "@/components/ui/skeleton";

/** Seller area skeleton — header + stat cards / rows. Private pages (no SEO
 *  status-code concern), so a segment loading.tsx is the simple right tool. */
export default function SellerLoading() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true">
      <p role="status" className="sr-only">
        Loading your seller area…
      </p>
      <div aria-hidden="true" className="flex flex-col gap-6">
        <div>
          <Skeleton className="h-7 w-48 rounded" />
          <Skeleton className="mt-2 h-4 w-72 max-w-full rounded" />
        </div>
        <div className="grid grid-cols-1 gap-3 min-[521px]:grid-cols-2 min-[761px]:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-lg border border-border bg-card p-4">
              <Skeleton className="h-3.5 w-24 rounded" />
              <Skeleton className="mt-3 h-7 w-20 rounded" />
              <Skeleton className="mt-3 h-3 w-32 rounded" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
