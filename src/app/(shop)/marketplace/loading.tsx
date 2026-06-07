import { Skeleton } from "@/components/ui/skeleton";
import { PageContainer } from "@/components/shared/page-container";
import { ListingGridSkeleton } from "@/components/marketplace/listing-grid";

/** Marketplace skeleton — breadcrumb, header, filter bar, results grid. */
export default function MarketplaceLoading() {
  return (
    <main className="flex-1 pt-5 pb-10 min-[761px]:pb-14">
      <PageContainer className="flex flex-col gap-6">
        <p role="status" className="sr-only">
          Loading the marketplace…
        </p>
        <div className="flex flex-col gap-4" aria-hidden="true">
          <Skeleton className="h-4 w-48 max-w-full rounded" />
          <div>
            <Skeleton className="h-8 w-56 max-w-full rounded" />
            <Skeleton className="mt-3 h-4 w-full max-w-xl rounded" />
          </div>
        </div>
        {/* search + filter bar */}
        <div className="flex flex-col gap-3" aria-hidden="true">
          <Skeleton className="h-10 w-full rounded-lg" />
          <Skeleton className="h-16 w-full rounded-lg" />
        </div>
        <div aria-hidden="true">
          <Skeleton className="mb-4 h-4 w-28 rounded" />
          <ListingGridSkeleton count={8} />
        </div>
      </PageContainer>
    </main>
  );
}
