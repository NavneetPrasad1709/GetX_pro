import { Skeleton } from "@/components/ui/skeleton";
import { PageContainer } from "@/components/shared/page-container";
import { ListingGridSkeleton } from "@/components/marketplace/listing-grid";

/** Category page skeleton — breadcrumb, header, listing grid. */
export default function CategoryLoading() {
  return (
    <main className="flex-1 pt-5 pb-10 min-[761px]:pb-14">
      <PageContainer className="flex flex-col gap-6">
        {/* Announce the transition to AT; the pulses below are decorative. */}
        <p role="status" className="sr-only">
          Loading listings…
        </p>
        <div className="flex flex-col gap-4" aria-hidden="true">
          <Skeleton className="h-4 w-64 max-w-full rounded" />
          <div>
            <Skeleton className="h-8 w-72 max-w-full rounded" />
            <Skeleton className="mt-3 h-4 w-full max-w-xl rounded" />
            <Skeleton className="mt-3 h-3.5 w-32 rounded" />
          </div>
        </div>
        <ListingGridSkeleton count={8} />
      </PageContainer>
    </main>
  );
}
