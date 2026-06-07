import Link from "next/link";
import Image from "next/image";
import { ArrowRightIcon } from "lucide-react";
import { PageContainer } from "@/components/shared/page-container";
import {
  formatListingCount,
  GameCard,
  type GameTileData,
} from "@/components/marketplace/game-card";

/**
 * "Browse by game" band (v10 ".games") — strip heading + game covers.
 * Step 05: now fed real catalog data (tiles) by the homepage server component.
 * Mobile: compact 2-col tiles (small thumb + name + count) — quick to scan,
 * no giant artwork. Desktop (≥761px): full 3:4 cover grid.
 */
export function BrowseGames({ games }: { games: GameTileData[] }) {
  if (games.length === 0) return null;

  return (
    <section className="border-t border-border py-10 min-[761px]:py-12 min-[1025px]:py-[62px]">
      <PageContainer>
        {/* heading as a slim strip: kicker chip · title · description · link */}
        <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg border border-border bg-card px-4 py-3 min-[761px]:mb-7 min-[761px]:px-5">
          {/* text-primary-hover: plain primary is 4.23:1 on the tinted card
              chip — below AA for 10.5px text; the lighter shade passes. */}
          <span className="rounded-full bg-primary/12 px-2.5 py-1 font-heading text-[10.5px] font-semibold tracking-[0.14em] text-primary-hover uppercase">
            Marketplace
          </span>
          <h2 className="font-heading text-base font-bold min-[761px]:text-lg">
            Browse by game
          </h2>
          <span
            className="hidden h-4 w-px bg-border min-[521px]:block"
            aria-hidden="true"
          />
          <p className="hidden text-[13.5px] text-muted-foreground min-[521px]:block">
            {games.length} hand-picked games. Quality over quantity.
          </p>
          <Link
            href="/games"
            className="ml-auto inline-flex shrink-0 items-center gap-1.5 rounded-sm font-heading text-sm font-semibold whitespace-nowrap text-muted-foreground transition-colors duration-150 hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            All games
            <ArrowRightIcon className="size-4" aria-hidden="true" />
          </Link>
        </div>

        {/* mobile: small tap-tiles, 2 per row */}
        <div className="grid grid-cols-2 gap-2.5 min-[761px]:hidden">
          {games.map((game) => (
            <Link
              key={game.slug}
              href={`/games/${game.slug}`}
              className="flex items-center gap-2.5 rounded-lg border border-border bg-card p-2.5 transition-colors duration-150 active:bg-secondary focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
            >
              <span className="relative grid size-11 shrink-0 place-items-center overflow-hidden rounded-md bg-secondary">
                {game.image ? (
                  <Image
                    src={game.image}
                    alt=""
                    fill
                    sizes="44px"
                    className="object-cover"
                  />
                ) : (
                  <span className="font-heading text-[11px] font-bold tracking-tight text-faint">
                    {game.mono}
                  </span>
                )}
              </span>
              <span className="min-w-0">
                <span className="block truncate font-heading text-[13px] font-semibold text-foreground">
                  {game.name}
                </span>
                <span className="block text-[11px] text-faint">
                  {game.listingCount === null
                    ? "Browse listings"
                    : formatListingCount(game.listingCount)}
                </span>
              </span>
            </Link>
          ))}
        </div>

        {/* desktop: full 3:4 cover grid — the shared GameCard, not a copy */}
        <div className="hidden min-[761px]:grid min-[761px]:grid-cols-3 min-[761px]:gap-4 min-[941px]:grid-cols-5">
          {games.map((game) => (
            <GameCard key={game.slug} game={game} />
          ))}
        </div>
      </PageContainer>
    </section>
  );
}
