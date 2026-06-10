import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  PackageCheckIcon,
  ShieldCheckIcon,
  MessageCircleIcon,
  StarIcon,
} from "lucide-react";
import { auth } from "@/lib/auth";
import {
  getSellerActiveListings,
  getSellerPublicProfile,
  getSellerResponseStats,
  getSellerReviews,
} from "@/server/services/reviews";
import { siteConfig } from "@/config/site";
import { cn } from "@/lib/utils";
import { formatReplyTime, trustTone } from "@/lib/trust";
import { PageContainer } from "@/components/shared/page-container";
import { Breadcrumbs } from "@/components/shared/breadcrumbs";
import { EmptyState } from "@/components/shared/empty-state";
import { VerifiedBadge } from "@/components/shared/verified-badge";
import { UserAvatar } from "@/components/shared/user-avatar";
import { Rating } from "@/components/shared/rating";
import { ListingCard } from "@/components/marketplace/listing-card";
import { ReviewsFeed } from "@/components/reviews/reviews-feed";
import { getUserBadges } from "@/server/services/badges";

type Props = { params: Promise<{ id: string }> };

const memberSinceFmt = new Intl.DateTimeFormat("en-IN", {
  month: "short",
  year: "numeric",
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const seller = await getSellerPublicProfile(id);
  if (!seller) return { title: "Seller", robots: { index: false } };

  const description =
    seller.ratingCount > 0
      ? `${seller.displayName} — ${seller.ratingAvg.toFixed(1)}★ from ${seller.ratingCount} reviews, ${seller.totalSales} sales on ${siteConfig.name}.`
      : `${seller.displayName} on ${siteConfig.name} — buy game accounts, items and top-ups with escrow protection.`;

  // Keywords from the games this seller is active in (Prompt 17).
  const listings = await getSellerActiveListings(seller.id, 12).catch(() => []);
  const games = [...new Set(listings.map((l) => l.game))];
  const keywords = [
    seller.displayName,
    `${seller.displayName} GETX`,
    ...games.map((g) => `buy ${g} accounts`),
    "game accounts",
    "escrow marketplace",
  ];

  const ogImage = {
    url: `/og/seller/${seller.id}`,
    width: 1200,
    height: 630,
    alt: `${seller.displayName} on ${siteConfig.name}`,
  };

  return {
    title: `${seller.displayName} — Seller profile`,
    description,
    keywords,
    alternates: { canonical: `/sellers/${seller.id}` },
    openGraph: {
      title: `${seller.displayName} · ${siteConfig.name}`,
      description,
      url: `/sellers/${seller.id}`,
      siteName: siteConfig.name,
      type: "profile",
      images: [ogImage],
    },
    twitter: {
      card: "summary_large_image",
      title: `${seller.displayName} · ${siteConfig.name}`,
      description,
      images: [ogImage.url],
    },
  };
}

export default async function SellerProfilePage({ params }: Props) {
  const { id } = await params;
  const [seller, session] = await Promise.all([
    getSellerPublicProfile(id),
    auth(),
  ]);
  if (!seller) notFound();

  const [reviewPage, listings, responseStats, badges] = await Promise.all([
    getSellerReviews(seller.id, { limit: 10 }),
    getSellerActiveListings(seller.id),
    getSellerResponseStats(seller.id),
    getUserBadges(seller.userId),
  ]);
  const canReply = session?.user?.id === seller.userId;

  const stats = [
    {
      icon: ShieldCheckIcon,
      label: "Trust",
      value: String(seller.trustScore),
      tone: trustTone(seller.trustScore),
    },
    {
      icon: PackageCheckIcon,
      label: "Sales",
      value: seller.totalSales.toLocaleString("en-IN"),
      tone: "text-foreground",
    },
    {
      icon: MessageCircleIcon,
      label: "Response",
      value:
        responseStats.avgFirstReplyMinutes !== null
          ? formatReplyTime(responseStats.avgFirstReplyMinutes)
          : "New",
      tone: "text-foreground",
    },
  ];

  return (
    <main className="flex-1 py-6">
      <PageContainer className="flex flex-col gap-6">
        <Breadcrumbs
          items={[
            { label: "Home", href: "/" },
            { label: "Games", href: "/games" },
            { label: seller.displayName },
          ]}
        />

        {/* header */}
        <header className="flex flex-col gap-4 rounded-lg border border-border bg-card p-5">
          <div className="flex items-start gap-4">
            <UserAvatar name={seller.displayName} image={seller.image} size="lg" />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="truncate font-heading text-xl font-bold">
                  {seller.displayName}
                </h1>
                {seller.kycVerified ? <VerifiedBadge size="sm" /> : null}
              </div>
              <p className="mt-1 text-xs text-faint">
                Member since {memberSinceFmt.format(seller.memberSince)}
                {seller.country ? ` · ${seller.country}` : ""}
              </p>
              {/* Community badges (Step 27) */}
              {badges.length > 0 ? (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {badges.map((b) => (
                    <span
                      key={b.badgeCode}
                      title={`${b.badge.name} — ${b.badge.description}`}
                      className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary"
                    >
                      ★ {b.badge.name}
                    </span>
                  ))}
                </div>
              ) : null}
              {seller.ratingCount > 0 ? (
                <div className="mt-2">
                  <Rating
                    value={seller.ratingAvg}
                    count={seller.ratingCount}
                    size="md"
                  />
                </div>
              ) : (
                <p className="mt-2 text-xs text-muted-foreground">No reviews yet</p>
              )}
              <p className="mt-1 text-xs text-faint">
                {responseStats.avgFirstReplyMinutes !== null
                  ? `Avg. response: ${formatReplyTime(responseStats.avgFirstReplyMinutes)}`
                  : "New seller · responds within 24 h"}
              </p>
            </div>
          </div>

          {seller.bio ? (
            <p className="text-sm break-words whitespace-pre-line text-muted-foreground">
              {seller.bio}
            </p>
          ) : null}

          <dl className="grid grid-cols-3 gap-2 min-[521px]:max-w-md">
            {stats.map((s) => (
              <div
                key={s.label}
                className="rounded-md bg-muted/60 p-2.5 text-center"
              >
                <dt className="text-[11px] font-medium tracking-wide text-faint uppercase">
                  {s.label}
                </dt>
                <dd
                  className={cn(
                    "mt-0.5 inline-flex items-center gap-1 font-heading text-lg font-bold",
                    s.tone,
                  )}
                >
                  <s.icon className="size-4" aria-hidden="true" />
                  {s.value}
                </dd>
              </div>
            ))}
          </dl>
        </header>

        {/* active listings */}
        <section aria-labelledby="seller-listings" className="flex flex-col gap-3">
          <h2 id="seller-listings" className="font-heading text-lg font-bold">
            Active listings
          </h2>
          {listings.length > 0 ? (
            <div className="grid grid-cols-2 gap-3 min-[521px]:grid-cols-3 min-[901px]:grid-cols-4">
              {listings.map((listing) => (
                <ListingCard key={listing.id} listing={listing} />
              ))}
            </div>
          ) : (
            <EmptyState
              headingLevel="h3"
              icon={<PackageCheckIcon />}
              title="No active listings right now"
              description="Check back soon — this seller may add new items."
            />
          )}
        </section>

        {/* reviews */}
        <section aria-labelledby="seller-reviews" className="flex flex-col gap-3">
          <h2 id="seller-reviews" className="font-heading text-lg font-bold">
            Reviews
          </h2>
          {reviewPage.reviews.length > 0 ? (
            <ReviewsFeed
              sellerId={seller.id}
              initial={reviewPage.reviews}
              initialCursor={reviewPage.nextCursor}
              canReply={canReply}
            />
          ) : (
            <EmptyState
              headingLevel="h3"
              icon={<StarIcon />}
              title="No reviews yet"
              description={`${seller.displayName} is new to GETX. All orders are escrow-protected and covered by the GETX money-back guarantee — so you can buy with confidence.`}
              action={
                <Link
                  href="/how-it-works"
                  className="text-xs text-primary hover:underline"
                >
                  How buyer protection works →
                </Link>
              }
            />
          )}
        </section>
      </PageContainer>
    </main>
  );
}
