import type { Metadata } from "next";
import Link from "next/link";
import {
  ShieldCheckIcon,
  ZapIcon,
  PackageIcon,
  SearchXIcon,
} from "lucide-react";
import { getListingBySlug } from "@/server/services/marketplace";
import { computeBuyerFee } from "@/lib/fees";
import { formatMoney } from "@/lib/money";
import { MAX_ORDER_QTY } from "@/lib/validators/order";
import { LISTING_TYPE_LABEL } from "@/config/games";
import { Breadcrumbs } from "@/components/shared/breadcrumbs";
import { EmptyState } from "@/components/shared/empty-state";
import { CtaLink } from "@/components/shared/cta-link";
import { UserAvatar } from "@/components/shared/user-avatar";
import { CheckoutForm } from "@/components/checkout/checkout-form";

export const metadata: Metadata = { title: "Checkout", robots: { index: false } };

type Props = {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

function parseQty(raw: string | string[] | undefined): number {
  const n = Number(Array.isArray(raw) ? raw[0] : raw);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(Math.trunc(n), MAX_ORDER_QTY);
}

/**
 * Checkout (Step 08) — order summary per docs/FEES.md, then place the order.
 * Auth is enforced by the (dashboard) layout (requireUser). The order is
 * created server-side in AWAITING_PAYMENT with money recomputed from the DB;
 * payment is wired in Step 09.
 */
export default async function CheckoutPage({ searchParams }: Props) {
  const sp = await searchParams;
  const slug = (Array.isArray(sp.listing) ? sp.listing[0] : sp.listing)?.trim();
  const listing = slug ? await getListingBySlug(slug) : null;

  if (!listing) {
    return (
      <div className="flex flex-col gap-5">
        <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Checkout" }]} />
        <EmptyState
          icon={<SearchXIcon />}
          title="This listing isn't available"
          description="It may have been sold, paused or removed. Browse the marketplace for more."
          action={<CtaLink href="/marketplace">Back to marketplace</CtaLink>}
        />
      </div>
    );
  }

  const outOfStock = listing.stock <= 0;
  const qty = Math.min(parseQty(sp.qty), Math.max(1, listing.stock));
  const { subtotalMinor, platformFeeMinor, totalMinor, platformFeePercent } =
    computeBuyerFee(listing.priceMinor, qty);
  const instant = listing.deliveryType === "INSTANT";

  return (
    <div className="flex flex-col gap-5">
      <Breadcrumbs
        items={[
          { label: "Home", href: "/" },
          { label: listing.title, href: `/listing/${listing.slug}` },
          { label: "Checkout" },
        ]}
      />

      <h1 className="text-2xl font-bold tracking-tight">Checkout</h1>

      <div className="grid grid-cols-1 gap-6 min-[761px]:grid-cols-[minmax(0,1fr)_320px]">
        {/* order summary */}
        <div className="flex flex-col gap-4">
          <div className="flex gap-3 rounded-lg border border-border bg-card p-4">
            <div className="grid size-14 shrink-0 place-items-center rounded-md bg-secondary font-heading text-sm font-bold text-foreground/30">
              {listing.game.name.slice(0, 3).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="line-clamp-2 text-sm font-semibold">{listing.title}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {LISTING_TYPE_LABEL[listing.type]} · {listing.game.name}
              </p>
              <p className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground">
                {instant ? (
                  <ZapIcon className="size-3.5 text-primary" aria-hidden="true" />
                ) : (
                  <PackageIcon className="size-3.5" aria-hidden="true" />
                )}
                {instant ? "Instant delivery" : "Manual delivery"}
              </p>
            </div>
          </div>

          {/* seller */}
          <div className="flex items-center gap-2.5 rounded-lg border border-border bg-card p-3">
            <UserAvatar
              name={listing.seller.displayName}
              image={listing.seller.image}
              size="sm"
            />
            <span className="flex-1 text-sm">
              Sold by{" "}
              <span className="font-semibold">{listing.seller.displayName}</span>
            </span>
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-success">
              <ShieldCheckIcon className="size-3.5" aria-hidden="true" />
              {listing.seller.trustScore}
            </span>
          </div>

          {/* price breakdown (docs/FEES.md) */}
          <dl className="flex flex-col gap-2 rounded-lg border border-border bg-card p-4 text-sm">
            <div className="flex items-center justify-between">
              <dt className="text-muted-foreground">
                Subtotal {qty > 1 ? `(${qty} × ${formatMoney(listing.priceMinor, listing.currency)})` : ""}
              </dt>
              <dd className="tabular-nums">{formatMoney(subtotalMinor, listing.currency)}</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-muted-foreground">
                Platform fee ({platformFeePercent}%)
              </dt>
              <dd className="tabular-nums">{formatMoney(platformFeeMinor, listing.currency)}</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-muted-foreground">Payment processing</dt>
              <dd className="text-xs text-faint">included</dd>
            </div>
            <div className="mt-1 flex items-center justify-between border-t border-border pt-2.5">
              <dt className="font-semibold">Total (held in escrow)</dt>
              <dd className="font-heading text-lg font-bold tabular-nums">
                {formatMoney(totalMinor, listing.currency)}
              </dd>
            </div>
          </dl>
        </div>

        {/* place order */}
        <div className="min-[761px]:sticky min-[761px]:top-[84px] min-[761px]:self-start">
          {outOfStock ? (
            <EmptyState
              title="Out of stock"
              description="This listing has no stock right now."
              action={<CtaLink href="/marketplace">Browse marketplace</CtaLink>}
            />
          ) : (
            <CheckoutForm
              listingSlug={listing.slug}
              qty={qty}
              totalMinor={totalMinor}
              currency={listing.currency}
            />
          )}
        </div>
      </div>

      <p className="text-xs text-faint">
        By placing this order you agree to the{" "}
        <Link href="/terms" className="text-primary hover:text-primary-hover">
          Terms
        </Link>{" "}
        and{" "}
        <Link href="/refund-policy" className="text-primary hover:text-primary-hover">
          Refund Policy
        </Link>
        .
      </p>
    </div>
  );
}
