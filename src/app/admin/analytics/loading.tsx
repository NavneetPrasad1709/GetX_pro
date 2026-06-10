import { Skeleton } from "@/components/ui/skeleton";

/** Page-level skeleton for the analytics cockpit while server aggregates load. */
export default function AnalyticsLoading() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-end justify-between gap-3">
        <div className="space-y-2">
          <Skeleton className="h-7 w-40" />
          <Skeleton className="h-4 w-64" />
        </div>
        <Skeleton className="h-9 w-36" />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-20" />
        ))}
      </div>
      <Skeleton className="h-[320px]" />
      <Skeleton className="h-[200px]" />
      <div className="grid gap-4 lg:grid-cols-2">
        <Skeleton className="h-[220px]" />
        <Skeleton className="h-[220px]" />
      </div>
    </div>
  );
}
