import Link from "next/link";
import { XIcon } from "lucide-react";
import { searchListings, type FacetCounts } from "@/server/services/marketplace";
import {
  buildMarketplaceParams,
  hasActiveFilters,
  marketplaceHref,
  type MarketplaceFilters,
} from "@/lib/validators/marketplace";
import { LISTING_TYPE_LABEL } from "@/config/games";
import { formatMoney } from "@/lib/money";
import { ListingCard } from "@/components/marketplace/listing-card";
import {
  ListingGrid,
  ListingGridEmpty,
} from "@/components/marketplace/listing-grid";
import { Pagination } from "@/components/shared/pagination";
import { CtaLink } from "@/components/shared/cta-link";

type GameOption = { slug: string; name: string };

type Chip = { label: string; href: string };

function priceLabel(min?: number, max?: number): string {
  if (min !== undefined && max !== undefined)
    return `${formatMoney(min)} – ${formatMoney(max)}`;
  if (min !== undefined) return `From ${formatMoney(min)}`;
  return `Up to ${formatMoney(max!)}`;
}

/** Active-filter chips, each linking to the URL with THAT filter removed. */
function buildChips(f: MarketplaceFilters, games: GameOption[]): Chip[] {
  const chips: Chip[] = [];

  if (f.q) {
    chips.push({
      label: `“${f.q}”`,
      href: marketplaceHref(f, { q: undefined }),
    });
  }
  if (f.game) {
    const name = games.find((g) => g.slug === f.game)?.name ?? f.game;
    chips.push({ label: name, href: marketplaceHref(f, { game: undefined }) });
  }
  if (f.type) {
    chips.push({
      label: LISTING_TYPE_LABEL[f.type],
      href: marketplaceHref(f, { type: undefined }),
    });
  }
  if (f.delivery) {
    chips.push({
      label: f.delivery === "INSTANT" ? "Instant delivery" : "Manual delivery",
      href: marketplaceHref(f, { delivery: undefined }),
    });
  }
  if (f.minPriceMinor !== undefined || f.maxPriceMinor !== undefined) {
    chips.push({
      label: priceLabel(f.minPriceMinor, f.maxPriceMinor),
      href: marketplaceHref(f, {
        minPriceMinor: undefined,
        maxPriceMinor: undefined,
      }),
    });
  }
  if (f.trust !== undefined) {
    chips.push({
      label: `Trust ${f.trust}+`,
      href: marketplaceHref(f, { trust: undefined }),
    });
  }
  if (f.rating !== undefined) {
    chips.push({
      label: `${f.rating}★ & up`,
      href: marketplaceHref(f, { rating: undefined }),
    });
  }
  if (f.minSales !== undefined) {
    chips.push({
      label: `${f.minSales}+ sales`,
      href: marketplaceHref(f, { minSales: undefined }),
    });
  }
  if (f.verified) {
    chips.push({
      label: "Verified seller",
      href: marketplaceHref(f, { verified: undefined }),
    });
  }
  if (f.currency) {
    chips.push({
      label: f.currency,
      href: marketplaceHref(f, { currency: undefined }),
    });
  }

  return chips;
}

/**
 * Server-rendered marketplace results: count, active-filter chips (each a
 * zero-JS link that removes one filter), the listing grid, pagination, and the
 * empty state. Wrapped in a keyed <Suspense> by the page so each filter change
 * shows the skeleton while this re-runs. One query, seller + game included (no
 * N+1).
 */
export async function MarketplaceResults({
  filters,
  games,
}: {
  filters: MarketplaceFilters;
  games: GameOption[];
  /** Forward-compatible: accepted so the page can pass it; not used yet. */
  facets?: FacetCounts;
}) {
  const { items, total, page, pageCount } = await searchListings(filters);
  const filtered = hasActiveFilters(filters);
  const chips = buildChips(filters, games);

  // Base query (everything except page) so pagination keeps the active filters.
  const baseQuery = buildMarketplaceParams(filters, { page: 1 }).toString();

  return (
    <section aria-labelledby="marketplace-results" className="flex flex-col gap-4">
      <h2 id="marketplace-results" className="sr-only">
        Search results
      </h2>

      {/* count + active filter chips + clear-all */}
      <div className="flex flex-col gap-3">
        <p className="text-[13px] text-faint" role="status" aria-live="polite">
          {total === 0
            ? "No matching listings"
            : `${total.toLocaleString("en-IN")} ${total === 1 ? "listing" : "listings"}`}
          {pageCount > 1 ? ` · Page ${page} of ${pageCount}` : ""}
        </p>

        {chips.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2">
            {chips.map((chip) => (
              <Link
                key={chip.label}
                href={chip.href}
                scroll={false}
                aria-label={`Remove filter: ${chip.label}`}
                className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted py-1 pr-2 pl-3 text-xs font-medium text-foreground transition-colors hover:border-primary/40 hover:text-primary focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
              >
                {chip.label}
                <XIcon className="size-3.5 opacity-70" aria-hidden="true" />
              </Link>
            ))}
            <Link
              href="/marketplace"
              className="rounded-sm px-1.5 text-xs font-semibold text-primary transition-colors hover:text-primary-hover focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
            >
              Clear all
            </Link>
          </div>
        ) : null}
      </div>

      {items.length === 0 ? (
        filtered ? (
          // When a buyer narrowed to a single game and found nothing, point them
          // at that game's page — every empty category there has a demand-capture
          // "notify me" form (Prompt 12), so the intent isn't lost.
          filters.game ? (
            <ListingGridEmpty
              title={`No ${games.find((g) => g.slug === filters.game)?.name ?? "listings"} listings yet`}
              description="Be the first to know when a verified seller lists here — leave your email on the game page, or clear your filters to browse everything."
              action={
                <div className="flex flex-wrap items-center justify-center gap-2.5">
                  <CtaLink href={`/games/${filters.game}`}>
                    Request a seller
                  </CtaLink>
                  <Link
                    href="/marketplace"
                    className="rounded-sm px-2 text-sm font-semibold text-primary hover:text-primary-hover focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                  >
                    Clear all filters
                  </Link>
                </div>
              }
            />
          ) : (
            <ListingGridEmpty
              title="No listings match your filters"
              description="Try widening your price range, switching the game, or clearing a filter."
              action={<CtaLink href="/marketplace">Clear all filters</CtaLink>}
            />
          )
        ) : (
          <ListingGridEmpty
            title="No listings yet — be the first seller!"
            description="The marketplace is wide open. Set up your shop in 5 minutes and own this market."
            action={<CtaLink href="/become-seller">Start selling</CtaLink>}
          />
        )
      ) : (
        <>
          <ListingGrid>
            {items.map((listing, i) => (
              <ListingCard key={listing.id} listing={listing} priority={i < 4} />
            ))}
          </ListingGrid>
          <Pagination
            page={page}
            pageCount={pageCount}
            basePath="/marketplace"
            searchParams={baseQuery}
            className="mt-2"
          />
        </>
      )}
    </section>
  );
}
