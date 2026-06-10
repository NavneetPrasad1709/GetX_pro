// This page is intentionally dynamic: searchParams-driven filter state prevents
// ISR. The getActiveGames() call is cache()-wrapped per request. A future
// unstable_cache upgrade is tracked in Step 28 (Algolia search).
import type { Metadata } from "next";
import { Suspense } from "react";
import { getActiveGames } from "@/server/services/catalog";
import { getFacetCounts } from "@/server/services/marketplace";
import {
  buildMarketplaceParams,
  isIndexableView,
  parseMarketplaceSearchParams,
  type MarketplaceFilters,
} from "@/lib/validators/marketplace";
import { getGameCopy } from "@/config/games";
import { siteConfig } from "@/config/site";
import { PageContainer } from "@/components/shared/page-container";
import { Breadcrumbs } from "@/components/shared/breadcrumbs";
import { Skeleton } from "@/components/ui/skeleton";
import { ListingGridSkeleton } from "@/components/marketplace/listing-grid";
import { MarketplaceFilters as MarketplaceFilterBar } from "@/components/marketplace/marketplace-filters";
import { MarketplaceResults } from "@/components/marketplace/marketplace-results";
import { InstantSearchBar } from "@/components/marketplace/instant-search-bar";

type Props = {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

/** Pluralized "accounts / items / top-ups / boosts" for SEO copy. */
const TYPE_PLURAL: Record<MarketplaceFilters["type"] & string, string> = {
  ACCOUNT: "accounts",
  ITEM: "items",
  CURRENCY: "top-ups",
  BOOSTING: "boosting services",
};

/** Build a human title from the active filters (nice tab + share previews). */
function titleFor(f: MarketplaceFilters): string {
  if (f.q) return `Search results for “${f.q}”`;
  const gameName = f.game ? getGameCopy(f.game).name : null;
  const typePlural = f.type ? TYPE_PLURAL[f.type] : null;
  if (gameName && typePlural) return `Buy ${gameName} ${typePlural}`;
  if (gameName) return `Buy ${gameName} accounts, items & top-ups`;
  if (typePlural) return `Buy game ${typePlural}`;
  return "Marketplace — buy & sell game accounts, items & top-ups";
}

export async function generateMetadata({
  searchParams,
}: Props): Promise<Metadata> {
  const filters = parseMarketplaceSearchParams(await searchParams);
  const title = titleFor(filters);
  const description = `Browse verified ${siteConfig.name} listings — game accounts, items, currency top-ups and boosting. Filter by game, price, delivery speed and seller trust. Every order is escrow-protected.`;

  return {
    title,
    description,
    // Faceted/searched/paginated variants are thin duplicates of the dedicated
    // game/category SEO pages → noindex (follow) them; only the clean
    // /marketplace is indexable. All variants canonicalize to the root.
    robots: isIndexableView(filters) ? undefined : { index: false, follow: true },
    alternates: { canonical: "/marketplace" },
    openGraph: {
      title: `${title} · ${siteConfig.name}`,
      description,
      url: "/marketplace",
      siteName: siteConfig.name,
      type: "website",
      images: [
        { url: "/getx-mark.webp", width: 1254, height: 1254, alt: siteConfig.name },
      ],
    },
    twitter: {
      card: "summary",
      title: `${title} · ${siteConfig.name}`,
      description,
      images: ["/getx-mark.webp"],
    },
  };
}

function ResultsSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-hidden="true">
      <Skeleton className="h-4 w-28 rounded" />
      <ListingGridSkeleton count={8} />
    </div>
  );
}

/**
 * Marketplace — cross-game browse with search, filters, sort and pagination,
 * all reflected in the URL (shareable + SEO-friendly). The grid is server-
 * rendered for speed/SEO; only the filter bar ships client JS. Each filter
 * change re-renders <MarketplaceResults/>; the keyed <Suspense> shows the
 * skeleton while the new query streams.
 */
export default async function MarketplacePage({ searchParams }: Props) {
  const filters = parseMarketplaceSearchParams(await searchParams);
  const [games, facets] = await Promise.all([
    getActiveGames().then((gs) => gs.map((g) => ({ slug: g.slug, name: g.name }))),
    getFacetCounts(filters),
  ]);

  // A key that changes with ANY param so the grid re-suspends on filter change.
  const resultsKey = buildMarketplaceParams(filters).toString() || "all";

  return (
    <main className="flex-1 pt-5 pb-10 min-[761px]:pb-14">
      <PageContainer className="flex flex-col gap-6">
        <div className="flex flex-col gap-4">
          <Breadcrumbs
            items={[{ label: "Home", href: "/" }, { label: "Marketplace" }]}
          />
          <header>
            <h1 className="text-[clamp(24px,3.5vw,32px)] font-bold">
              Marketplace
            </h1>
            <p className="mt-1.5 max-w-prose text-[14.5px] text-muted-foreground">
              Every listing is from a verified seller and protected by escrow —
              search, filter and buy with confidence.
            </p>
          </header>
        </div>

        {/* Instant search (Step 28) — renders only when Algolia is configured; otherwise null
            so the filter bar's server-side search remains the search UX. */}
        <InstantSearchBar />

        {/* useSearchParams lives in the filter bar — Suspense satisfies the
            static-render boundary requirement and is a no-op when dynamic. */}
        <Suspense fallback={null}>
          <MarketplaceFilterBar filters={filters} games={games} facets={facets} />
        </Suspense>

        <Suspense key={resultsKey} fallback={<ResultsSkeleton />}>
          <MarketplaceResults filters={filters} games={games} facets={facets} />
        </Suspense>
      </PageContainer>
    </main>
  );
}
