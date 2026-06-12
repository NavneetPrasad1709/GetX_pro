import Link from "next/link";
import { ShieldCheckIcon, PackageCheckIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { trustTone, formatReplyTime } from "@/lib/trust";
import { Rating } from "@/components/shared/rating";
import { VerifiedBadge } from "@/components/shared/verified-badge";
import { UserAvatar } from "@/components/shared/user-avatar";
import { SellerLevelBadge } from "@/components/shared/seller-level-badge";
import type { ListingDetail } from "@/server/services/marketplace";

const memberSinceFmt = new Intl.DateTimeFormat("en-US", {
  month: "short",
  year: "numeric",
});

/**
 * Seller trust panel — the core conversion signal on a listing page: who the
 * seller is, their trust score, rating, sales count, verification badge, plus
 * the platform's escrow + money-back guarantees. Pure server component.
 */
export function SellerTrustPanel({
  seller,
  avgFirstReplyMinutes,
}: {
  seller: ListingDetail["seller"];
  avgFirstReplyMinutes: number | null;
}) {
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
            <Link
              href={`/sellers/${seller.id}`}
              className="truncate rounded-sm font-heading text-base font-bold hover:text-primary focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
            >
              {seller.displayName}
            </Link>
            {seller.kycVerified ? <VerifiedBadge size="sm" /> : null}
            {seller.proMember ? (
              <span
                className="inline-flex items-center rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-primary"
                title="GETX Pro seller"
              >
                PRO
              </span>
            ) : null}
            <SellerLevelBadge level={seller.sellerLevel} size="xs" />
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
            {seller.totalSales.toLocaleString("en-US")}
          </dd>
        </div>
      </dl>

      {seller.ratingCount > 0 ? (
        <p className="-mt-1 text-center text-[11px] text-faint">
          Based on {seller.ratingCount.toLocaleString("en-US")}{" "}
          {seller.ratingCount === 1 ? "review" : "reviews"}
        </p>
      ) : null}

      {avgFirstReplyMinutes !== null ? (
        <p className="text-center text-[11px] text-faint">
          Avg. response: {formatReplyTime(avgFirstReplyMinutes)}
        </p>
      ) : null}

      {seller.totalSales === 0 && seller.ratingCount === 0 ? (
        <p className="rounded-md border border-border bg-muted/40 px-3 py-2.5 text-[12.5px] text-muted-foreground">
          <span className="font-semibold text-foreground">New seller.</span>{" "}
          Every order is escrow-protected regardless of review count — your
          money is held safely until you confirm delivery.
        </p>
      ) : null}

      {/* Platform guarantees now live in EscrowProtectionPanel (rendered directly
          above this panel on the listing page) — this panel stays focused on
          seller signals only, avoiding duplicate escrow/money-back copy. */}
    </section>
  );
}
