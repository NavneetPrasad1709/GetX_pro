import { ShieldCheckIcon, BadgeCheckIcon, PackageCheckIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Rating } from "@/components/shared/rating";
import { TrustBadge } from "@/components/shared/trust-badge";
import { UserAvatar } from "@/components/shared/user-avatar";
import type { ListingDetail } from "@/server/services/marketplace";

function trustTone(score: number): string {
  if (score >= 90) return "text-success";
  if (score >= 70) return "text-warning";
  return "text-muted-foreground";
}

const memberSinceFmt = new Intl.DateTimeFormat("en-IN", {
  month: "short",
  year: "numeric",
});

/**
 * Seller trust panel — the core conversion signal on a listing page: who the
 * seller is, their trust score, rating, sales count, verification badge, plus
 * the platform's escrow + money-back guarantees. Pure server component.
 */
export function SellerTrustPanel({ seller }: { seller: ListingDetail["seller"] }) {
  return (
    <section
      aria-labelledby="seller-panel-heading"
      className="flex flex-col gap-4 rounded-lg border border-border bg-card p-4 min-[761px]:p-5"
    >
      <h2 id="seller-panel-heading" className="sr-only">
        About the seller
      </h2>

      {/* identity */}
      <div className="flex items-center gap-3">
        <UserAvatar name={seller.displayName} image={seller.image} size="lg" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate font-heading text-base font-bold">
              {seller.displayName}
            </span>
            {seller.kycVerified ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-success/12 px-2 py-0.5 text-[11px] font-semibold text-success">
                <BadgeCheckIcon className="size-3.5" aria-hidden="true" />
                ID Verified
              </span>
            ) : null}
          </div>
          <p className="mt-0.5 text-xs text-faint">
            Member since {memberSinceFmt.format(seller.memberSince)}
            {seller.country ? ` · ${seller.country}` : ""}
          </p>
        </div>
      </div>

      {/* trust / rating / sales stats */}
      <dl className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-md bg-muted/60 p-2.5">
          <dt className="text-[11px] font-medium tracking-wide text-faint uppercase">
            Trust
          </dt>
          <dd
            className={cn(
              "mt-0.5 inline-flex items-center gap-1 font-heading text-lg font-bold",
              trustTone(seller.trustScore),
            )}
          >
            <ShieldCheckIcon className="size-4" aria-hidden="true" />
            {seller.trustScore}
          </dd>
        </div>
        <div className="rounded-md bg-muted/60 p-2.5">
          <dt className="text-[11px] font-medium tracking-wide text-faint uppercase">
            Rating
          </dt>
          <dd className="mt-1 flex items-center justify-center">
            {seller.ratingCount > 0 ? (
              <Rating
                value={seller.ratingAvg}
                size="sm"
                showValue
                className="gap-1"
              />
            ) : (
              <span className="text-sm font-semibold text-muted-foreground">
                New
              </span>
            )}
          </dd>
        </div>
        <div className="rounded-md bg-muted/60 p-2.5">
          <dt className="text-[11px] font-medium tracking-wide text-faint uppercase">
            Sales
          </dt>
          <dd className="mt-0.5 inline-flex items-center gap-1 font-heading text-lg font-bold text-foreground">
            <PackageCheckIcon
              className="size-4 text-muted-foreground"
              aria-hidden="true"
            />
            {seller.totalSales.toLocaleString("en-IN")}
          </dd>
        </div>
      </dl>

      {seller.ratingCount > 0 ? (
        <p className="-mt-1 text-center text-[11px] text-faint">
          Based on {seller.ratingCount.toLocaleString("en-IN")}{" "}
          {seller.ratingCount === 1 ? "review" : "reviews"}
        </p>
      ) : null}

      {/* platform guarantees */}
      <div className="flex flex-col gap-2 border-t border-border pt-4">
        <TrustBadge variant="escrow" size="sm" className="w-full justify-start" />
        <TrustBadge
          variant="moneyback"
          size="sm"
          className="w-full justify-start"
        />
      </div>
    </section>
  );
}
