import type { Metadata } from "next";
import { Suspense } from "react";
import { Gamepad2Icon } from "lucide-react";
import { getActiveGames } from "@/server/services/catalog";
import { getGameCopy } from "@/config/games";
import { siteConfig } from "@/config/site";
import { Skeleton } from "@/components/ui/skeleton";
import { PageContainer } from "@/components/shared/page-container";
import { Breadcrumbs } from "@/components/shared/breadcrumbs";
import { EmptyState } from "@/components/shared/empty-state";
import { GameCard, type GameTileData } from "@/components/marketplace/game-card";

// Game listing counts change slowly — ISR keeps the games index fresh for 5 min.
export const revalidate = 300;

const TITLE = "Browse games — buy accounts, top-ups & boosting";
const DESCRIPTION =
  "All GETX games in one place. Buy and sell game accounts, items, in-game currency and boosting with escrow protection — 5 hand-picked games, Pokemon GO first.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/games" },
  openGraph: {
    title: `${TITLE} · ${siteConfig.name}`,
    description: DESCRIPTION,
    url: "/games",
    siteName: siteConfig.name,
    type: "website",
    images: [
      { url: "/getx-mark.webp", width: 1254, height: 1254, alt: siteConfig.name },
    ],
  },
  twitter: {
    card: "summary", // square mark — see root layout note
    title: `${TITLE} · ${siteConfig.name}`,
    description: DESCRIPTION,
    images: ["/getx-mark.webp"],
  },
};

const GRID_CLASS =
  "grid grid-cols-2 gap-3 min-[521px]:grid-cols-3 min-[761px]:gap-4 min-[941px]:grid-cols-5";

/** Async slice: only the DB-backed grid streams; the header renders instantly. */
async function GamesGrid() {
  const games = await getActiveGames();

  const tiles: GameTileData[] = games.map((game) => {
    const copy = getGameCopy(game.slug, game.name);
    return {
      name: game.name,
      slug: game.slug,
      listingCount: game.listingCount,
      image: game.bannerUrl ?? game.iconUrl ?? copy.image,
      mono: copy.mono,
    };
  });

  if (tiles.length === 0) {
    return (
      <EmptyState
        icon={<Gamepad2Icon />}
        title="Games coming soon"
        description="The launch catalog is being prepared. Check back shortly!"
        headingLevel="h2"
      />
    );
  }

  return (
    <div className={GRID_CLASS}>
      {tiles.map((tile, i) => (
        <GameCard key={tile.slug} game={tile} priority={i < 5} />
      ))}
    </div>
  );
}

/** Cover-grid skeleton shown while the games query streams. */
function GamesGridSkeleton() {
  return (
    <div className={GRID_CLASS} aria-hidden="true">
      {Array.from({ length: 5 }).map((_, i) => (
        <div
          key={i}
          className="overflow-hidden rounded-lg border border-border bg-card"
        >
          <Skeleton className="aspect-[3/4] w-full rounded-none" />
          <div className="px-[13px] py-[11px]">
            <Skeleton className="h-3.5 w-20 rounded" />
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Games index — server-rendered grid of the launch catalog with live counts.
 *
 * The grid is wrapped in a MANUAL <Suspense> instead of a segment
 * loading.tsx: a loading.tsx here would wrap every nested /games/* segment
 * and flush HTTP 200 before the [slug]/[category] layouts can notFound()
 * with a real 404. Manual boundaries keep skeleton UX without that cost.
 */
export default function GamesPage() {
  return (
    <main className="flex-1 py-8 min-[761px]:py-12">
      <PageContainer>
        <Breadcrumbs
          items={[{ label: "Home", href: "/" }, { label: "Games" }]}
          className="mb-4"
        />
        <header className="mb-6 min-[761px]:mb-8">
          <span className="font-heading text-xs font-semibold tracking-[0.14em] text-primary uppercase">
            Marketplace
          </span>
          <h1 className="mt-2 text-[clamp(26px,4vw,36px)] font-bold">
            Browse games
          </h1>
          <p className="mt-1.5 max-w-prose text-[14.5px] text-muted-foreground">
            {siteConfig.launchGames.length} hand-picked games — quality over
            quantity. Every order is escrow-protected.
          </p>
        </header>

        <Suspense fallback={<GamesGridSkeleton />}>
          <GamesGrid />
        </Suspense>
      </PageContainer>
    </main>
  );
}
