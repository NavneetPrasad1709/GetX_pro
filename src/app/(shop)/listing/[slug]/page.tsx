import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getListingBySlug,
  getMoreFromSeller,
  getMoreInCategory,
  type ListingDetail,
} from "@/server/services/marketplace";
import { getSellerReviews, getSellerResponseStats } from "@/server/services/reviews";
import { recordListingView } from "@/server/services/liquidity";
import { captureServerEvent } from "@/lib/posthog";
import {
  ListingGrid,
} from "@/components/marketplace/listing-grid";
import {
  ListingCard,
  type ListingCardData,
} from "@/components/marketplace/listing-card";
import {
  getGameCopy,
  LISTING_TYPE_LABEL,
  LISTING_ATTRIBUTE_LABELS,
} from "@/config/games";
import { siteConfig } from "@/config/site";
import { auth } from "@/lib/auth";
import { minorToMajorString } from "@/lib/money";
import { PageContainer } from "@/components/shared/page-container";
import { Breadcrumbs } from "@/components/shared/breadcrumbs";
import { ListingGallery } from "@/components/marketplace/listing-gallery";
import { BuyBox } from "@/components/marketplace/buy-box";
import { SellerTrustPanel } from "@/components/marketplace/seller-trust-panel";
import { EscrowProtectionPanel } from "@/components/shared/escrow-protection-panel";
import { ChatWithSellerButton } from "@/components/chat/chat-with-seller-button";
import { Rating } from "@/components/shared/rating";
import { ReviewList } from "@/components/reviews/review-list";

// Listing detail: price/stock can change — revalidate every 60s for freshness.
export const revalidate = 60;

type Props = { params: Promise<{ slug: string }> };

/** Collapse whitespace + cap length for a clean meta description. */
function metaDescription(text: string): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > 155 ? `${flat.slice(0, 152)}…` : flat;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const listing = await getListingBySlug(slug);
  // Defensive — the layout already 404s missing listings, and the cached
  // service makes this free.
  if (!listing) notFound();

  const canonical = `/listing/${listing.slug}`;
  const description = metaDescription(listing.description);
  // Dynamic branded 1200×630 share card (Prompt 17) — renders rich previews in
  // Discord/WhatsApp/Twitter (gaming audiences share listings constantly).
  const ogImage = {
    url: `/og/listing/${listing.slug}`,
    width: 1200,
    height: 630,
    alt: listing.title,
  };

  return {
    title: listing.title,
    description,
    alternates: { canonical },
    openGraph: {
      title: `${listing.title} · ${siteConfig.name}`,
      description,
      url: canonical,
      siteName: siteConfig.name,
      type: "website",
      images: [ogImage],
    },
    twitter: {
      card: "summary_large_image",
      title: `${listing.title} · ${siteConfig.name}`,
      description,
      images: [ogImage.url],
    },
  };
}

/**
 * Product JSON-LD for rich results. Description is user content but the payload
 * is JSON-serialized and `<` is escaped, so it can't break out of the script
 * tag (same pattern as Breadcrumbs). NOTE: no aggregateRating yet — listing-
 * level reviews arrive in Step 13; emitting the seller's rating as a *product*
 * rating would be misleading structured data. The visible trust panel carries
 * the seller's rating until then.
 */
function productJsonLd(listing: ListingDetail): string {
  const url = `${siteConfig.url}/listing/${listing.slug}`;
  const images =
    listing.images.length > 0
      ? listing.images
      : [`${siteConfig.url}/getx-mark.webp`];

  const data: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: listing.title,
    description: listing.description,
    image: images,
    sku: listing.id,
    category: `${listing.game.name} ${listing.category.name}`,
    brand: { "@type": "Brand", name: listing.seller.displayName },
    offers: {
      "@type": "Offer",
      price: minorToMajorString(listing.priceMinor, listing.currency),
      priceCurrency: listing.currency,
      availability:
        listing.stock > 0
          ? "https://schema.org/InStock"
          : "https://schema.org/OutOfStock",
      url,
      seller: { "@type": "Organization", name: listing.seller.displayName },
    },
  };

  // AggregateRating (Prompt 17) — the seller's aggregate, shown only at ≥3 reviews
  // (Google's minimum; emitting fewer risks a structured-data manual action).
  if (listing.seller.ratingCount >= 3) {
    data.aggregateRating = {
      "@type": "AggregateRating",
      ratingValue: listing.seller.ratingAvg.toFixed(1),
      reviewCount: String(listing.seller.ratingCount),
      bestRating: "5",
      worstRating: "1",
    };
  }

  return JSON.stringify(data).replace(/</g, "\\u003c");
}

/** "currentRank" → "Current rank" (fallback for keys without a config label). */
function humanizeKey(key: string): string {
  const spaced = key.replace(/([A-Z])/g, " $1").trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1).toLowerCase();
}

/** A related-listings rail (Prompt 17) — title + "See all" link + a card grid. */
function RelatedSection({
  title,
  href,
  listings,
}: {
  title: string;
  href: string;
  listings: ListingCardData[];
}) {
  return (
    <section aria-label={title} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-heading text-lg font-bold">{title}</h2>
        <Link
          href={href}
          className="text-sm font-semibold text-primary hover:text-primary-hover focus-visible:outline-none"
        >
          See all →
        </Link>
      </div>
      <ListingGrid>
        {listings.map((l) => (
          <ListingCard key={l.id} listing={l} />
        ))}
      </ListingGrid>
    </section>
  );
}

export default async function ListingPage({ params }: Props) {
  const { slug } = await params;
  const listing = await getListingBySlug(slug);
  if (!listing) notFound();

  // Fire-and-forget view counter (Prompt 12) — never blocks/breaks the render.
  // NOTE: this page is ISR (revalidate=60), so the body runs at most once per
  // 60s per slug; the count is a coarse popularity signal, not exact hits.
  void recordListingView(listing.id);

  // Logged-in non-owners can DM the seller (Step 11). Anon/owner see no button.
  const session = await auth();
  const canChat = Boolean(session?.user) && session!.user.id !== listing.seller.userId;

  // Analytics (Step 31): structured listing view — IDs + amount only, no PII. (ISR-cached page, so
  // this fires per cache-miss; PostHog autocapture $pageview covers the per-user view separately.)
  captureServerEvent("listing_viewed", session?.user?.id ?? "anonymous", {
    listingId: listing.id,
    gameSlug: listing.game.slug,
    categoryKind: listing.type,
    priceMinor: listing.priceMinor,
  });

  const copy = getGameCopy(listing.game.slug, listing.game.name);
  const instant = listing.deliveryType === "INSTANT";

  // Reviews are seller-level (tied to completed orders). Show the latest few on
  // the listing; the full paginated feed lives on the seller's public profile.
  const [reviewPage, responseStats, moreFromSeller, moreInCategory] =
    await Promise.all([
      getSellerReviews(listing.seller.id, { limit: 5 }),
      getSellerResponseStats(listing.seller.id),
      // Related rails (Prompt 17) — parallel, no added waterfall.
      getMoreFromSeller(listing.seller.id, listing.slug, 4),
      getMoreInCategory(listing.game.slug, listing.category.slug, listing.slug, 4),
    ]);

  const labels = LISTING_ATTRIBUTE_LABELS[listing.type] ?? {};
  const attributes = Object.entries(listing.attributes).map(([key, value]) => ({
    label: labels[key] ?? humanizeKey(key),
    value: typeof value === "number" ? value.toLocaleString("en-IN") : value,
  }));

  // Extra bottom padding below 901px so the sticky mobile buy bar (rendered by
  // BuyBox, sitting above the 74px bottom-nav) never covers the last content.
  return (
    <main className="flex-1 pt-5 pb-32 min-[901px]:pb-14">
      <PageContainer className="flex flex-col gap-5">
        <Breadcrumbs
          items={[
            { label: "Home", href: "/" },
            { label: listing.game.name, href: `/games/${listing.game.slug}` },
            {
              label: listing.category.name,
              href: `/games/${listing.game.slug}/${listing.category.slug}`,
            },
            { label: listing.title },
          ]}
        />

        {/* title + meta (full width) */}
        <header className="flex flex-col gap-2.5">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="rounded-md bg-muted px-2 py-0.5 font-semibold tracking-wide text-muted-foreground uppercase">
              {LISTING_TYPE_LABEL[listing.type]}
            </span>
            <span className="text-faint">
              {listing.game.name} · {listing.category.name}
            </span>
          </div>
          <h1 className="text-[clamp(22px,3.2vw,30px)] leading-tight font-bold">
            {listing.title}
          </h1>
        </header>

        <div className="grid grid-cols-1 gap-6 min-[901px]:grid-cols-[minmax(0,1fr)_360px] min-[901px]:gap-8">
          {/* gallery (left, row 1) */}
          <div className="min-[901px]:col-start-1 min-[901px]:row-start-1">
            <ListingGallery
              images={listing.images}
              title={listing.title}
              mono={copy.mono}
              gameImage={copy.image}
            />
          </div>

          {/* buy box + seller panel (right column, spans both rows on desktop;
              on mobile it sits right after the gallery — above the fold) */}
          <aside className="flex flex-col gap-4 min-[901px]:sticky min-[901px]:top-20 min-[901px]:col-start-2 min-[901px]:row-span-2 min-[901px]:row-start-1 min-[901px]:self-start">
            <BuyBox
              slug={listing.slug}
              priceMinor={listing.priceMinor}
              currency={listing.currency}
              stock={listing.stock}
              deliveryType={listing.deliveryType}
            />
            <EscrowProtectionPanel variant="full" />
            <SellerTrustPanel
              seller={listing.seller}
              avgFirstReplyMinutes={responseStats.avgFirstReplyMinutes}
            />
            {canChat ? (
              <ChatWithSellerButton sellerProfileId={listing.seller.id} />
            ) : null}
          </aside>

          {/* description + details (left, row 2) */}
          <div className="flex flex-col gap-6 min-[901px]:col-start-1 min-[901px]:row-start-2">
            <section aria-labelledby="listing-description">
              <h2
                id="listing-description"
                className="mb-2 font-heading text-lg font-bold"
              >
                Description
              </h2>
              {/* whitespace-pre-line keeps the seller's line breaks; React
                  escapes the text (never dangerouslySetInnerHTML). */}
              <p className="text-[14.5px] leading-relaxed whitespace-pre-line break-words text-muted-foreground">
                {listing.description}
              </p>
            </section>

            {attributes.length > 0 ? (
              <section aria-labelledby="listing-details">
                <h2
                  id="listing-details"
                  className="mb-2 font-heading text-lg font-bold"
                >
                  Details
                </h2>
                <dl className="grid grid-cols-1 gap-x-6 gap-y-2 min-[521px]:grid-cols-2">
                  {attributes.map((attr) => (
                    <div
                      key={attr.label}
                      className="flex items-center justify-between gap-3 border-b border-border py-2 text-sm"
                    >
                      <dt className="text-muted-foreground">{attr.label}</dt>
                      <dd className="font-semibold text-foreground">
                        {attr.value}
                      </dd>
                    </div>
                  ))}
                </dl>
              </section>
            ) : null}

            <section
              aria-labelledby="listing-delivery"
              className="rounded-lg border border-border bg-card/40 p-4"
            >
              <h2 id="listing-delivery" className="sr-only">
                Delivery &amp; protection
              </h2>
              <p className="text-sm text-muted-foreground">
                <span className="font-semibold text-foreground">
                  {instant ? "Instant delivery." : "Manual delivery."}
                </span>{" "}
                {instant
                  ? "Delivered automatically right after your payment is confirmed."
                  : "The seller delivers via secure chat once your payment is confirmed — usually within a few hours."}{" "}
                Your money stays in escrow until you confirm everything is as
                described — or {siteConfig.escrow.autoReleaseDays} days pass and
                it auto-releases.{" "}
                <span className="font-semibold text-foreground">
                  Not happy? Open a dispute
                </span>{" "}
                — our team reviews within 48 hours.
              </p>
            </section>
          </div>
        </div>

        {/* reviews — seller-level, every one tied to a completed order */}
        <section aria-labelledby="reviews-heading" className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="reviews-heading" className="font-heading text-lg font-bold">
              Reviews of {listing.seller.displayName}
            </h2>
            {listing.seller.ratingCount > 0 ? (
              <Rating
                value={listing.seller.ratingAvg}
                count={listing.seller.ratingCount}
                size="md"
              />
            ) : null}
          </div>

          {/* Make it unambiguous these are SELLER-level (not listing-level) ratings */}
          <p className="-mt-1 text-xs text-faint">
            Ratings left by buyers across all of {listing.seller.displayName}
            &apos;s completed orders{" · "}
            <Link
              href={`/sellers/${listing.seller.id}`}
              className="underline underline-offset-2 hover:text-primary"
            >
              Full seller profile
            </Link>
          </p>

          {reviewPage.reviews.length > 0 ? (
            <>
              <ReviewList reviews={reviewPage.reviews} />
              <Link
                href={`/sellers/${listing.seller.id}`}
                className="text-sm font-semibold text-primary hover:text-primary-hover"
              >
                See the seller&apos;s full profile &amp; all reviews →
              </Link>
            </>
          ) : (
            <div className="rounded-lg border border-border bg-card/40 p-4 flex flex-col gap-1.5">
              <p className="text-sm font-semibold text-foreground">No reviews yet for this seller.</p>
              <p className="text-[13px] text-muted-foreground">
                Every order on GETX is escrow-protected — your payment is held
                safely until you confirm delivery, regardless of the seller&apos;s
                review count.
              </p>
            </div>
          )}
        </section>

        {/* related discovery (Prompt 17) — only when ≥2 results (a 1-item rail looks broken) */}
        {moreFromSeller.length >= 2 ? (
          <RelatedSection
            title={`More from ${listing.seller.displayName}`}
            href={`/sellers/${listing.seller.id}`}
            listings={moreFromSeller}
          />
        ) : null}
        {moreInCategory.length >= 2 ? (
          <RelatedSection
            title={`More in ${listing.category.name}`}
            href={`/games/${listing.game.slug}/${listing.category.slug}`}
            listings={moreInCategory}
          />
        ) : null}
      </PageContainer>

      <script
        type="application/ld+json"
        // Safe: JSON-serialized + `<` escaped (see productJsonLd).
        dangerouslySetInnerHTML={{ __html: productJsonLd(listing) }}
      />
    </main>
  );
}
