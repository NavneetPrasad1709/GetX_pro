import Link from "next/link";
import Image from "next/image";
import { ZapIcon, PackageIcon, ShieldCheckIcon, BadgeCheckIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { trustTone } from "@/lib/trust";
import { LISTING_TYPE_LABEL } from "@/config/games";
import { Price } from "@/components/shared/price";
import { Rating } from "@/components/shared/rating";
import { UserAvatar } from "@/components/shared/user-avatar";

/**
 * Presentational listing data. Real Listing rows are mapped to this shape in
 * later steps — the card stays free of Prisma/business logic (SOLID).
 */
export type ListingCardData = {
  id: string;
  slug: string;
  title: string;
  image?: string | null;
  priceMinor: number;
  currency?: string;
  game: string;
  type: "ACCOUNT" | "ITEM" | "CURRENCY" | "BOOSTING";
  deliveryType: "INSTANT" | "MANUAL";
  rating?: number | null;
  reviews?: number | null;
  seller: { id?: string; name: string; image?: string | null; trustScore?: number | null; kycVerified?: boolean; sellerLevel?: string; proMember?: boolean };
};

type Props = {
  listing: ListingCardData;
  className?: string;
  /** set true for the first row of above-the-fold cards (LCP) */
  priority?: boolean;
  /** server-set in the "Promoted" row only → renders the FTC-required label (Prompt 15) */
  isPromoted?: boolean;
};

/**
 * Listing grid card. Uses the "overlay link" pattern: the title link covers the
 * whole card via an `after:` pseudo-element, so the entire card is clickable —
 * while the seller name can be its own independent link (`relative z-10`) WITHOUT
 * nesting one `<a>` inside another (which is invalid HTML + breaks hydration).
 * Stays a pure server component (no client JS).
 */
export function ListingCard({
  listing,
  className,
  priority = false,
  isPromoted = false,
}: Props) {
  const {
    slug,
    title,
    image,
    priceMinor,
    currency,
    game,
    type,
    deliveryType,
    rating,
    reviews,
    seller,
  } = listing;
  const instant = deliveryType === "INSTANT";

  return (
    <div
      className={cn(
        "group/card relative flex flex-col overflow-hidden rounded-lg border border-border bg-card transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-[0_18px_40px_-22px] hover:shadow-primary/30 focus-within:ring-3 focus-within:ring-ring/50",
        className,
      )}
    >
      {/* cover */}
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-secondary">
        {image ? (
          <Image
            src={image}
            alt={title}
            fill
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
            className="object-cover transition-transform duration-300 group-hover/card:scale-[1.04]"
            priority={priority}
          />
        ) : (
          <div className="flex size-full items-center justify-center bg-gradient-to-br from-secondary to-accent">
            <span className="font-heading text-3xl font-extrabold text-foreground/15">
              {game.slice(0, 3).toUpperCase()}
            </span>
          </div>
        )}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-background/80 via-transparent to-transparent" />

        {/* game tag (+ FTC-required "Promoted" label when in the paid row) */}
        <div className="absolute top-2 left-2 flex flex-col items-start gap-1">
          {isPromoted ? (
            <span
              className="rounded-full bg-amber-500/85 px-2 py-0.5 text-[10px] font-bold tracking-wide text-black uppercase backdrop-blur-sm"
              aria-label="Sponsored listing"
            >
              Promoted
            </span>
          ) : null}
          <span className="rounded-full bg-background/70 px-2.5 py-1 text-[11px] font-semibold text-foreground backdrop-blur-sm">
            {game}
          </span>
        </div>

        {/* delivery badge */}
        <span
          className={cn(
            "absolute top-2 right-2 inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-semibold backdrop-blur-sm",
            instant
              ? "bg-primary/20 text-primary"
              : "bg-background/70 text-muted-foreground",
          )}
        >
          {instant ? (
            <ZapIcon className="size-3" aria-hidden="true" />
          ) : (
            <PackageIcon className="size-3" aria-hidden="true" />
          )}
          {instant ? "Instant" : "Manual"}
        </span>
      </div>

      {/* body */}
      <div className="flex flex-1 flex-col gap-2.5 p-3">
        <div className="flex items-center justify-between gap-2">
          <span className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
            {LISTING_TYPE_LABEL[type]}
          </span>
          {rating != null ? (
            <Rating value={rating} count={reviews ?? undefined} size="sm" />
          ) : null}
        </div>

        {/* title carries the whole-card link via an inset overlay pseudo-element */}
        <h3 className="line-clamp-2 text-sm leading-snug font-medium text-foreground group-hover/card:text-primary">
          <Link
            href={`/listing/${slug}`}
            className="rounded-sm after:absolute after:inset-0 after:content-[''] focus-visible:outline-none"
          >
            {title}
          </Link>
        </h3>

        <div className="mt-auto flex items-end justify-between gap-2 pt-1">
          <Price amountMinor={priceMinor} currency={currency} size="lg" />
        </div>

        {/* seller — sits above the card overlay so its link is independent */}
        <div className="relative z-10 flex min-h-11 items-center gap-2 border-t border-border pt-2.5">
          <UserAvatar name={seller.name} image={seller.image} size="sm" />
          {seller.id ? (
            <Link
              href={`/sellers/${seller.id}`}
              className="min-w-0 flex-1 truncate rounded-sm text-xs text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
            >
              {seller.name}
            </Link>
          ) : (
            <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
              {seller.name}
            </span>
          )}
          {seller.proMember ? (
            <span
              className="inline-flex items-center rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-primary"
              title="GETX Pro seller"
            >
              PRO
            </span>
          ) : null}
          {seller.kycVerified ? (
            <span
              className="inline-flex items-center gap-1 rounded-full bg-success/12 px-1.5 py-0.5 text-[10px] font-semibold text-success"
              title="ID-verified seller"
            >
              <BadgeCheckIcon className="size-3" aria-hidden="true" />
              Verified
            </span>
          ) : null}
          {seller.trustScore != null ? (
            <span
              className="inline-flex items-center gap-1 text-xs font-semibold"
              title="Seller trust score"
            >
              <ShieldCheckIcon
                className={cn("size-3.5", trustTone(seller.trustScore))}
                aria-hidden="true"
              />
              <span className={trustTone(seller.trustScore)}>
                {seller.trustScore}
              </span>
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}
