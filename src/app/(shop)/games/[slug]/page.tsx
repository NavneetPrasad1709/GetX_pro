import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { ArrowRightIcon, ShieldCheckIcon } from "lucide-react";
import {
  getCategoryPreviews,
  getGameBySlug,
  type GameDetail,
} from "@/server/services/catalog";
import { getGameCopy } from "@/config/games";
import { siteConfig } from "@/config/site";
import { Skeleton } from "@/components/ui/skeleton";
import { PageContainer } from "@/components/shared/page-container";
import { Breadcrumbs } from "@/components/shared/breadcrumbs";
import { CtaLink } from "@/components/shared/cta-link";
import { CategoryCard } from "@/components/marketplace/category-card";
import { ListingCard } from "@/components/marketplace/listing-card";
import {
  ListingGrid,
  ListingGridEmpty,
  ListingGridSkeleton,
} from "@/components/marketplace/listing-grid";
import { formatListingCount } from "@/components/marketplace/game-card";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const game = await getGameBySlug(slug);
  // The real HTTP 404 gate is layout.tsx (metadata STREAMS since Next 15.2,
  // so a notFound() here can't set the status). This check is defensive —
  // and the cache()-wrapped service makes it free.
  if (!game) notFound();

  const copy = getGameCopy(game.slug, game.name);
  const canonical = `/games/${game.slug}`;
  // Dims are only declared for the asset we control; DB banners (R2, Step 12)
  // have unknown dimensions, so they go through as plain URLs.
  const shareImage =
    game.bannerUrl ??
    copy.image ??
    ({ url: "/getx-mark.webp", width: 1254, height: 1254, alt: game.name } as const);

  return {
    title: copy.metaTitle,
    description: copy.description,
    alternates: { canonical },
    openGraph: {
      title: `${copy.metaTitle} · ${siteConfig.name}`,
      description: copy.description,
      url: canonical,
      siteName: siteConfig.name,
      type: "website",
      images: [shareImage],
    },
    twitter: {
      card: "summary", // square/portrait assets — see root layout note
      title: `${copy.metaTitle} · ${siteConfig.name}`,
      description: copy.description,
      images: [typeof shareImage === "string" ? shareImage : shareImage.url],
    },
  };
}

/**
 * Async slice: the per-category "latest listings" previews. Streams below
 * the banner/categories (which render instantly from the layout-cached game
 * lookup) — listing queries never block the shell or the HTTP status.
 */
async function CategoryPreviews({ game }: { game: GameDetail }) {
  const previews = await getCategoryPreviews(game.categories, 4);

  return (
    <>
      {game.categories
        .filter((category) => (previews.get(category.id)?.length ?? 0) > 0)
        .map((category) => (
          <section key={category.id} aria-labelledby={`cat-${category.slug}`}>
            <div className="mb-3.5 flex items-center justify-between gap-3">
              <h2
                id={`cat-${category.slug}`}
                className="font-heading text-lg font-bold min-[761px]:text-xl"
              >
                Latest {category.name}
              </h2>
              <Link
                href={`/games/${game.slug}/${category.slug}`}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-sm font-heading text-sm font-semibold whitespace-nowrap text-muted-foreground transition-colors duration-150 hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
              >
                View all
                <ArrowRightIcon className="size-4" aria-hidden="true" />
              </Link>
            </div>
            <ListingGrid>
              {(previews.get(category.id) ?? []).map((listing) => (
                <ListingCard key={listing.id} listing={listing} />
              ))}
            </ListingGrid>
          </section>
        ))}
    </>
  );
}

function CategoryPreviewsSkeleton() {
  return (
    <div aria-hidden="true">
      <Skeleton className="mb-4 h-6 w-52 rounded" />
      <ListingGridSkeleton count={4} />
    </div>
  );
}

/**
 * Game landing page — banner, category tiles and a latest-listings preview
 * per category. Full browse/filter arrives in Step 07.
 *
 * No segment loading.tsx here (it would wrap the [category] subtree and
 * flush HTTP 200 before its layout can 404) — the slow listing previews use
 * a manual <Suspense> below instead; everything else renders from the
 * already-cached game lookup.
 */
export default async function GamePage({ params }: Props) {
  const { slug } = await params;
  const game = await getGameBySlug(slug);
  if (!game) notFound();

  const copy = getGameCopy(game.slug, game.name);
  const banner = game.bannerUrl ?? copy.image;

  return (
    <main className="flex-1 pt-5 pb-10 min-[761px]:pb-14">
      <PageContainer className="flex flex-col gap-8 min-[761px]:gap-10">
        <div className="flex flex-col gap-4">
          <Breadcrumbs
            items={[
              { label: "Home", href: "/" },
              { label: "Games", href: "/games" },
              { label: game.name },
            ]}
          />

          {/* banner */}
          <section className="relative overflow-hidden rounded-lg border border-border bg-card">
            {banner ? (
              <>
                <Image
                  src={banner}
                  alt=""
                  fill
                  sizes="(max-width: 1120px) 100vw, 1076px"
                  className="object-cover"
                  priority
                />
                <div
                  className="absolute inset-0 bg-[linear-gradient(90deg,rgba(8,9,11,.92)_0%,rgba(8,9,11,.7)_55%,rgba(8,9,11,.35)_100%)]"
                  aria-hidden="true"
                />
              </>
            ) : (
              <div
                className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(77,124,254,0.16),transparent_55%)]"
                aria-hidden="true"
              >
                <span className="absolute right-6 bottom-2 font-heading text-[96px] leading-none font-extrabold tracking-tight text-white/[0.04] select-none min-[761px]:text-[140px]">
                  {copy.mono}
                </span>
              </div>
            )}

            <div className="relative p-5 min-[761px]:p-9">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-success/12 px-2.5 py-1 font-heading text-[10.5px] font-semibold tracking-[0.14em] text-success uppercase">
                <ShieldCheckIcon className="size-3.5" aria-hidden="true" />
                Escrow protected
              </span>
              <h1 className="mt-3 text-[clamp(26px,4.5vw,40px)] font-bold">
                {game.name}
              </h1>
              <p className="mt-2 max-w-[58ch] text-[14.5px] text-muted-foreground">
                {copy.description}
              </p>
              <div className="mt-4 flex flex-wrap items-center gap-2 text-[12.5px] text-muted-foreground">
                <span className="glass rounded-full px-3 py-1.5 font-heading font-semibold">
                  {formatListingCount(game.listingCount)}
                </span>
                <span className="glass rounded-full px-3 py-1.5 font-heading font-semibold">
                  {game.categories.length}{" "}
                  {game.categories.length === 1 ? "category" : "categories"}
                </span>
              </div>
            </div>
          </section>
        </div>

        {/* categories */}
        <section aria-labelledby="game-categories">
          <h2
            id="game-categories"
            className="mb-3.5 font-heading text-lg font-bold min-[761px]:text-xl"
          >
            Shop by category
          </h2>
          <div className="grid grid-cols-1 gap-2.5 min-[521px]:grid-cols-2 min-[941px]:grid-cols-4">
            {game.categories.map((category) => (
              <CategoryCard
                key={category.id}
                name={category.name}
                kind={category.kind}
                listingCount={category.listingCount}
                href={`/games/${game.slug}/${category.slug}`}
              />
            ))}
          </div>
        </section>

        {/* latest listings per category */}
        {game.listingCount === 0 ? (
          <ListingGridEmpty
            title="No listings yet — be the first seller!"
            description={`${game.name} listings are wide open. Set up your shop in 5 minutes and own this market.`}
            action={<CtaLink href="/become-seller">Start selling</CtaLink>}
          />
        ) : (
          <Suspense fallback={<CategoryPreviewsSkeleton />}>
            <CategoryPreviews game={game} />
          </Suspense>
        )}
      </PageContainer>
    </main>
  );
}
