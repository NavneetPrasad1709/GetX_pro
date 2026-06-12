import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { PackagePlusIcon, ZapIcon, PackageIcon } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { getSellerListings } from "@/server/services/listings";
import { MarketPulse } from "@/components/seller/market-pulse";
import { formatMoney } from "@/lib/money";
import { LISTING_TYPE_LABEL } from "@/config/games";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { ListingActions } from "@/components/seller/listing-actions";
import { ListingStatusBadge } from "@/components/seller/listing-status-badge";
import { BoostListingButton } from "@/components/seller/boost-listing-button";

export const metadata: Metadata = { title: "My listings" };

/** Manage listings — status, price, stock and actions per row. */
export default async function SellerListingsPage() {
  const session = await requireUser();
  const [listings, profile] = await Promise.all([
    getSellerListings(session.user.id),
    db.sellerProfile.findUnique({
      where: { userId: session.user.id },
      select: { id: true },
    }),
  ]);
  const now = new Date();

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">My listings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {listings.length === 0
            ? "Your shop is ready for its first listing."
            : `${listings.length} listing${listings.length === 1 ? "" : "s"} — drafts are only visible to you.`}
        </p>
      </div>

      {profile && listings.length > 0 ? (
        <Suspense fallback={null}>
          <MarketPulse sellerId={profile.id} />
        </Suspense>
      ) : null}

      {listings.length === 0 ? (
        <EmptyState
          icon={<PackagePlusIcon />}
          title="Your shop is empty — your first listing is free"
          description="List a game account, items, top-ups or boosting in under 2 minutes. You keep 90–95% of every sale."
          headingLevel="h2"
          action={
            <Button render={<Link href="/seller/listings/new" />}>
              Create your first listing
            </Button>
          }
        />
      ) : (
        <ul className="flex flex-col gap-2.5">
          {listings.map((listing) => (
            <li
              key={listing.id}
              className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4 min-[761px]:flex-row min-[761px]:items-center min-[761px]:justify-between"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <ListingStatusBadge status={listing.status} />
                  <span className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
                    {LISTING_TYPE_LABEL[listing.type]}
                  </span>
                  <span className="inline-flex items-center gap-1 text-[11px] text-faint">
                    {listing.deliveryType === "INSTANT" ? (
                      <ZapIcon className="size-3" aria-hidden="true" />
                    ) : (
                      <PackageIcon className="size-3" aria-hidden="true" />
                    )}
                    {listing.deliveryType === "INSTANT" ? "Instant" : "Manual"}
                  </span>
                </div>
                <p className="mt-1.5 truncate text-sm font-medium">
                  {listing.title}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {listing.gameName} · {listing.categoryName} ·{" "}
                  <span className="font-semibold text-foreground">
                    {formatMoney(listing.priceMinor, listing.currency)}
                  </span>{" "}
                  · stock {listing.stock}
                </p>
                {/* boost control for live listings (Prompt 15) */}
                {listing.status === "ACTIVE" ? (
                  <div className="mt-2.5 flex flex-wrap items-center gap-2">
                    <BoostListingButton
                      listingId={listing.id}
                      active={
                        listing.isFeatured &&
                        listing.boostExpiresAt != null &&
                        listing.boostExpiresAt > now
                      }
                    />
                  </div>
                ) : null}
              </div>

              <ListingActions listingId={listing.id} status={listing.status} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
