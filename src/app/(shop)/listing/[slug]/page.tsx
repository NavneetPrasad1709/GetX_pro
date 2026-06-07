import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getListingBySlug, type ListingDetail } from "@/server/services/marketplace";
import {
  getGameCopy,
  LISTING_TYPE_LABEL,
  LISTING_ATTRIBUTE_LABELS,
} from "@/config/games";
import { siteConfig } from "@/config/site";
import { minorToMajorString } from "@/lib/money";
import { PageContainer } from "@/components/shared/page-container";
import { Breadcrumbs } from "@/components/shared/breadcrumbs";
import { ListingGallery } from "@/components/marketplace/listing-gallery";
import { BuyBox } from "@/components/marketplace/buy-box";
import { SellerTrustPanel } from "@/components/marketplace/seller-trust-panel";

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
  // images[0] is typed `string` (non-null), so an empty array must be handled
  // explicitly — otherwise the fallback object branch becomes unreachable.
  const shareImage =
    listing.images.length > 0
      ? listing.images[0]
      : ({
          url: "/getx-mark.webp",
          width: 1254,
          height: 1254,
          alt: listing.title,
        } as const);

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
      images: [shareImage],
    },
    twitter: {
      card: "summary",
      title: `${listing.title} · ${siteConfig.name}`,
      description,
      images: [typeof shareImage === "string" ? shareImage : shareImage.url],
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

  const data = {
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
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

/** "currentRank" → "Current rank" (fallback for keys without a config label). */
function humanizeKey(key: string): string {
  const spaced = key.replace(/([A-Z])/g, " $1").trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1).toLowerCase();
}

export default async function ListingPage({ params }: Props) {
  const { slug } = await params;
  const listing = await getListingBySlug(slug);
  if (!listing) notFound();

  const copy = getGameCopy(listing.game.slug, listing.game.name);
  const instant = listing.deliveryType === "INSTANT";

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
            />
          </div>

          {/* buy box + seller panel (right column, spans both rows on desktop;
              on mobile it sits right after the gallery — above the fold) */}
          <aside className="flex flex-col gap-4 min-[901px]:col-start-2 min-[901px]:row-span-2 min-[901px]:row-start-1 min-[901px]:self-start">
            <BuyBox
              slug={listing.slug}
              priceMinor={listing.priceMinor}
              currency={listing.currency}
              stock={listing.stock}
              deliveryType={listing.deliveryType}
            />
            <SellerTrustPanel seller={listing.seller} />
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
                described.
              </p>
            </section>
          </div>
        </div>
      </PageContainer>

      <script
        type="application/ld+json"
        // Safe: JSON-serialized + `<` escaped (see productJsonLd).
        dangerouslySetInnerHTML={{ __html: productJsonLd(listing) }}
      />
    </main>
  );
}
