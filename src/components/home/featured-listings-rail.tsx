import { PageContainer } from "@/components/shared/page-container";
import { ListingCard, type ListingCardData } from "@/components/marketplace/listing-card";

/**
 * Homepage "Promoted" rail (Prompt 15, Stream 2). Paid placements, FTC-labeled
 * via the ListingCard `isPromoted` chip. Pure server component; renders nothing
 * when there are no active boosts (no empty band).
 */
export function FeaturedListingsRail({ listings }: { listings: ListingCardData[] }) {
  if (listings.length === 0) return null;

  return (
    <section aria-labelledby="featured-heading" className="py-8 min-[761px]:py-10">
      <PageContainer>
        <h2
          id="featured-heading"
          className="mb-4 font-heading text-xl font-bold min-[761px]:text-2xl"
        >
          Promoted listings
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
          {listings.map((listing) => (
            <ListingCard
              key={`home-promoted-${listing.id}`}
              listing={listing}
              isPromoted
            />
          ))}
        </div>
      </PageContainer>
    </section>
  );
}
