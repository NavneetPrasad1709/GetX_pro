import { HomeHero } from "@/components/home/home-hero";
import { CategoryMegaGrid } from "@/components/home/category-mega-grid";
import { BrowseGames } from "@/components/home/browse-games";
import { ProtectionSteps } from "@/components/home/protection-steps";
import { WhyGetx } from "@/components/home/why-getx";
import { SellerCta } from "@/components/home/seller-cta";
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
 * Homepage (v10, evolved Step 07): hero → shop-by-category mega-grid (Eldorado-
 * style scannable facets) → browse by game → protection steps → why GETX →
 * seller CTA. Game covers/counts come from the live catalog (Step 05).
 *
 * The fake-testimonial "reviews" band was removed pre-launch (no fabricated
 * social proof — see docs/audit/UX_UI_AUDIT_REPORT.md); HomeReviews returns
 * with REAL data at Step 13.
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
      <CategoryMegaGrid />
      <BrowseGames games={tiles} />
      <ProtectionSteps />
      <WhyGetx />
      <SellerCta />
    </main>
  );
}
