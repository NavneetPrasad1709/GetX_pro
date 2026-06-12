import Link from "next/link";
import Image from "next/image";
import { cn } from "@/lib/utils";

/**
 * Presentational game tile data — pages map `GameSummary` (service) + game
 * copy (config) into this shape; the card stays free of Prisma/business logic.
 */
export type GameTileData = {
  name: string;
  slug: string;
  /** null = count unknown (e.g. DB unreachable fallback) → line is hidden. */
  listingCount: number | null;
  image: string | null;
  /** Monogram shown when there is no cover art. */
  mono: string;
};

export function formatListingCount(count: number): string {
  if (count === 0) return "No listings yet";
  return `${count.toLocaleString("en-US")} ${count === 1 ? "listing" : "listings"}`;
}

type Props = {
  game: GameTileData;
  className?: string;
  /** true for above-the-fold covers (LCP). */
  priority?: boolean;
};

/** 3:4 cover tile for the games index (v10 ".games" cover style). */
export function GameCard({ game, className, priority = false }: Props) {
  return (
    <Link
      href={`/games/${game.slug}`}
      // No aria-label: the name + listing count in the card content ARE the
      // accessible name — a custom label would trip WCAG 2.5.3 label-in-name.
      className={cn(
        "group/game block overflow-hidden rounded-lg border border-border bg-card transition-all duration-150 hover:-translate-y-[3px] hover:border-white/15 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
        className,
      )}
    >
      <div className="relative aspect-[3/4] overflow-hidden bg-secondary">
        {game.image ? (
          <Image
            src={game.image}
            alt={`${game.name} listings`}
            fill
            sizes="(max-width: 520px) 50vw, (max-width: 940px) 33vw, 20vw"
            className="object-cover transition-transform duration-300 group-hover/game:scale-[1.03]"
            priority={priority}
          />
        ) : (
          <span className="absolute inset-0 grid place-items-center bg-[radial-gradient(ellipse_at_top_left,rgba(77,124,254,0.14),transparent_55%)] font-heading text-3xl font-bold tracking-tight text-faint">
            {game.mono}
          </span>
        )}
        <div
          className="absolute inset-0 bg-[linear-gradient(180deg,transparent_48%,rgba(8,9,11,.9))]"
          aria-hidden="true"
        />
        {/* line-clamp-2: a long admin-seeded name must not overflow the
            gradient band onto the artwork (tiles are ~150px on phones). */}
        <span className="absolute right-[13px] bottom-[11px] left-[13px] line-clamp-2 font-heading text-[15px] font-semibold text-white">
          {game.name}
        </span>
      </div>
      <div className="px-[13px] py-[11px] text-[13px] text-faint">
        {game.listingCount === null
          ? "Browse listings"
          : formatListingCount(game.listingCount)}
      </div>
    </Link>
  );
}
