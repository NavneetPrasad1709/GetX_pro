import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import {
  getCategoryListingsPage,
  getGameBySlug,
} from "@/server/services/catalog";
import { CATEGORY_KIND_COPY } from "@/config/games";
import { siteConfig } from "@/config/site";
import { PageContainer } from "@/components/shared/page-container";
import { Breadcrumbs } from "@/components/shared/breadcrumbs";
import { CtaLink } from "@/components/shared/cta-link";
import { Pagination } from "@/components/shared/pagination";
import { ListingCard } from "@/components/marketplace/listing-card";
import {
  ListingGrid,
  ListingGridEmpty,
} from "@/components/marketplace/listing-grid";
import { formatListingCount } from "@/components/marketplace/game-card";

type Props = {
  params: Promise<{ slug: string; category: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

// ?page= is untrusted input — coerce to an int ≥ 1, fall back to 1 on garbage.
// Oversized values CLAMP to MAX_PAGE (instead of .max().catch(1), which would
// silently rewrite ?page=200000 to page 1) so they still exceed pageCount and
// hit the soft-404 branch like every other out-of-range page. The cap also
// keeps Prisma's 32-bit `skip` safe.
const pageSchema = z.coerce.number().int().min(1).catch(1);
const MAX_PAGE = 100_000;

function parsePage(raw: string | string[] | undefined): number {
  const page = pageSchema.parse(Array.isArray(raw) ? raw[0] : (raw ?? 1));
  return Math.min(page, MAX_PAGE);
}

export async function generateMetadata({
  params,
  searchParams,
}: Props): Promise<Metadata> {
  const [{ slug, category: categorySlug }, sp] = await Promise.all([
    params,
    searchParams,
  ]);
  const game = await getGameBySlug(slug);
  const category = game?.categories.find((c) => c.slug === categorySlug);
  // The real HTTP 404 gate is layout.tsx (metadata STREAMS since Next 15.2,
  // so a notFound() here can't set the status). This check is defensive —
  // and the cache()-wrapped service makes it free.
  if (!game || !category) notFound();

  // Deliberately NO listings query here: metadata must resolve instantly
  // (from the layout-cached game lookup) so it lands in <head> before the
  // shell streams — awaiting the count made crawler snapshots miss the meta
  // description. Out-of-range ?page= is soft-404'd by the page body instead.
  const page = parsePage(sp.page);
  const basePath = `/games/${game.slug}/${category.slug}`;
  const canonical = page > 1 ? `${basePath}?page=${page}` : basePath;
  const pageSuffix = page > 1 ? ` — Page ${page}` : "";

  const title = `Buy ${game.name} ${category.name}${pageSuffix}`;
  const description = `${CATEGORY_KIND_COPY[category.kind].blurb(game.name)} Every order is escrow-protected on ${siteConfig.name}.`;

  const shareImage =
    game.bannerUrl ??
    ({ url: "/getx-mark.webp", width: 1254, height: 1254, alt: game.name } as const);

  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      title: `${title} · ${siteConfig.name}`,
      description,
      url: canonical,
      siteName: siteConfig.name,
      type: "website",
      images: [shareImage],
    },
    twitter: {
      card: "summary", // square mark — see root layout note
      title: `${title} · ${siteConfig.name}`,
      description,
      images: [typeof shareImage === "string" ? shareImage : shareImage.url],
    },
  };
}

/**
 * Category page — paginated grid of one category's ACTIVE listings.
 * Advanced filters/sort arrive in Step 07; this is the SEO-friendly base.
 */
export default async function CategoryPage({ params, searchParams }: Props) {
  const [{ slug, category: categorySlug }, sp] = await Promise.all([
    params,
    searchParams,
  ]);

  const game = await getGameBySlug(slug);
  const category = game?.categories.find((c) => c.slug === categorySlug);
  if (!game || !category) notFound();

  const page = parsePage(sp.page);
  const { items, total, pageCount } = await getCategoryListingsPage(
    category.id,
    page,
  );

  // Beyond the last page (and not page 1) → soft 404 (noindex) instead of an
  // endless empty ?page= space for crawlers.
  if (page > 1 && page > pageCount) notFound();

  const basePath = `/games/${game.slug}/${category.slug}`;

  return (
    <main className="flex-1 pt-5 pb-10 min-[761px]:pb-14">
      <PageContainer className="flex flex-col gap-6">
        <div className="flex flex-col gap-4">
          <Breadcrumbs
            items={[
              { label: "Home", href: "/" },
              { label: "Games", href: "/games" },
              { label: game.name, href: `/games/${game.slug}` },
              { label: category.name },
            ]}
          />

          <header>
            <h1 className="text-[clamp(24px,3.5vw,32px)] font-bold">
              {game.name} {category.name}
            </h1>
            <p className="mt-1.5 max-w-prose text-[14.5px] text-muted-foreground">
              {CATEGORY_KIND_COPY[category.kind].blurb(game.name)}
            </p>
            <p className="mt-2.5 text-[13px] text-faint">
              {formatListingCount(total)}
              {pageCount > 1 ? ` · Page ${page} of ${pageCount}` : ""}
            </p>
          </header>
        </div>

        {items.length === 0 ? (
          <ListingGridEmpty
            headingLevel="h2"
            title="No listings yet — be the first seller!"
            description={`Nobody is selling ${game.name} ${category.name.toLowerCase()} yet. Set up your shop in 5 minutes and own this market.`}
            action={<CtaLink href="/become-seller">Start selling</CtaLink>}
          />
        ) : (
          <section aria-labelledby="category-listings">
            {/* sr-only h2: card titles are h3 — without this the outline
                would skip h1 → h3 (axe heading-order). */}
            <h2 id="category-listings" className="sr-only">
              {game.name} {category.name} listings
            </h2>
            <ListingGrid>
              {items.map((listing, i) => (
                <ListingCard
                  key={listing.id}
                  listing={listing}
                  priority={i < 4}
                />
              ))}
            </ListingGrid>
            <Pagination
              page={page}
              pageCount={pageCount}
              basePath={basePath}
              className="mt-6"
            />
          </section>
        )}
      </PageContainer>
    </main>
  );
}
