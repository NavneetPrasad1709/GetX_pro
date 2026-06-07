import { HomeHero } from "@/components/home/home-hero";
import { BrowseGames } from "@/components/home/browse-games";
import { ProtectionSteps } from "@/components/home/protection-steps";
import { WhyGetx } from "@/components/home/why-getx";
import { SellerCta } from "@/components/home/seller-cta";
import { HomeReviews } from "@/components/home/home-reviews";
import { getActiveGames } from "@/server/services/catalog";
import { GAME_COPY, getGameCopy } from "@/config/games";
import type { GameTileData } from "@/components/marketplace/game-card";

/** Static fallback tiles (no counts) so a DB hiccup never blanks the homepage. */
function fallbackTiles(): GameTileData[] {
  return GAME_COPY.map((copy) => ({
    name: copy.name,
    slug: copy.slug,
    listingCount: null,
    image: copy.image,
    mono: copy.mono,
  }));
}

/**
 * Homepage — the approved v10 design (docs/design-preview-v10.html):
 * hero → browse by game → protection steps → why GETX → seller CTA → reviews.
 * Step 05: game covers/counts come from the live catalog (was static).
 */
export default async function HomePage() {
  let tiles: GameTileData[];
  try {
    const games = await getActiveGames();
    tiles =
      games.length > 0
        ? games.map((game) => {
            const copy = getGameCopy(game.slug, game.name);
            return {
              name: game.name,
              slug: game.slug,
              listingCount: game.listingCount,
              image: game.bannerUrl ?? game.iconUrl ?? copy.image,
              mono: copy.mono,
            };
          })
        : fallbackTiles();
  } catch (error) {
    // Homepage must render even if Neon is briefly unreachable.
    console.error("[home] catalog unavailable, using fallback tiles:", error);
    tiles = fallbackTiles();
  }

  return (
    <main className="flex flex-1 flex-col">
      <HomeHero />
      <BrowseGames games={tiles} />
      <ProtectionSteps />
      <WhyGetx />
      <SellerCta />
      <HomeReviews />
    </main>
  );
}
