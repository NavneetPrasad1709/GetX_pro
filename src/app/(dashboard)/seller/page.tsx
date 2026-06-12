import type { Metadata } from "next";
import Link from "next/link";
import {
  ClockIcon,
  PackageIcon,
  ShieldCheckIcon,
  StarIcon,
  WalletIcon,
} from "lucide-react";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { siteConfig } from "@/config/site";
import { getSellerStats } from "@/server/services/listings";
import { formatMoney } from "@/lib/money";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  OnboardingChecklist,
  type OnboardingState,
} from "@/components/seller/onboarding-checklist";
import { FirstSaleCelebration } from "@/components/seller/first-sale-celebration";

export const metadata: Metadata = { title: "Seller overview" };

/**
 * Seller home — the CEO view starts simple (Step 06): live counts, money in
 * motion, wallet truth from the ledger. Charts/AI pricing arrive in Step 20.
 * Prompt 14 adds the activation checklist + first-sale celebration.
 */
export default async function SellerOverviewPage() {
  const session = await requireUser();
  // One extra query (Prompt 14) powers the checklist + celebration — no dup hit.
  const [stats, account] = await Promise.all([
    getSellerStats(session.user.id),
    db.user.findUnique({
      where: { id: session.user.id },
      select: {
        emailVerified: true,
        sellerProfile: {
          select: {
            id: true,
            kycStatus: true,
            firstListingAt: true,
            firstSaleAt: true,
            subscriptionTier: true,
            subscriptionExpiresAt: true,
            wallet: { select: { payoutMethodSet: true } },
          },
        },
      },
    }),
  ]);

  const sp = account?.sellerProfile;
  const onboarding: OnboardingState = {
    emailVerified: account?.emailVerified != null,
    kycApproved: sp?.kycStatus === "APPROVED",
    kycPending: sp?.kycStatus === "PENDING",
    firstListingDone: sp?.firstListingAt != null,
    payoutMethodSet: sp?.wallet?.payoutMethodSet ?? false,
  };
  const onboardingComplete =
    onboarding.emailVerified &&
    onboarding.kycApproved &&
    onboarding.firstListingDone &&
    onboarding.payoutMethodSet;

  const now = new Date();
  const isPro =
    sp?.subscriptionTier === "PRO" &&
    sp.subscriptionExpiresAt != null &&
    sp.subscriptionExpiresAt > now;
  const proDiscount = siteConfig.fees.subscription.proCommissionDiscount;

  const cards = [
    {
      icon: PackageIcon,
      label: "Active listings",
      value: String(stats.activeListings),
      hint:
        stats.draftListings > 0
          ? `${stats.draftListings} draft${stats.draftListings === 1 ? "" : "s"} waiting`
          : "Everything you publish shows here",
    },
    {
      icon: ClockIcon,
      label: "Pending orders",
      value: String(stats.pendingOrders),
      hint: "Paid or delivering — money in escrow",
    },
    {
      icon: WalletIcon,
      label: "Wallet balance",
      value: formatMoney(stats.walletBalanceMinor, stats.walletCurrency),
      hint:
        stats.walletHeldMinor > 0
          ? `+ ${formatMoney(stats.walletHeldMinor, stats.walletCurrency)} in escrow — released on completion`
          : "Computed from your ledger — payouts in Step 14",
    },
    {
      icon: StarIcon,
      label: "Rating",
      value:
        stats.ratingCount > 0
          ? `${stats.ratingAvg.toFixed(1)} (${stats.ratingCount})`
          : "—",
      hint:
        stats.ratingCount > 0
          ? "Average across completed orders"
          : "Reviews arrive with your first sales",
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          {stats.displayName}
        </h1>
        <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
          <ShieldCheckIcon className="size-4 text-success" aria-hidden="true" />
          Trust score {stats.trustScore}/100 — grows with every safe sale.
        </p>
      </div>

      {/* one-time first-sale celebration (Prompt 14) */}
      {sp?.firstSaleAt != null && sp.id ? (
        <FirstSaleCelebration sellerId={sp.id} />
      ) : null}

      {/* activation checklist — only while a step is still incomplete */}
      {!onboardingComplete ? (
        <OnboardingChecklist state={onboarding} />
      ) : null}

      <div className="grid grid-cols-1 gap-3 min-[521px]:grid-cols-2 min-[761px]:grid-cols-4">
        {cards.map((card) => (
          <Card key={card.label}>
            <CardHeader>
              <CardDescription className="flex items-center gap-1.5">
                <card.icon className="size-4" aria-hidden="true" />
                {card.label}
              </CardDescription>
              <CardTitle className="text-2xl tabular-nums">
                {card.value}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-faint">{card.hint}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* GETX Pro (Prompt 15) — upsell for FREE sellers, status for PRO */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {isPro ? "GETX Pro is active" : "Grow faster with GETX Pro"}
          </CardTitle>
          <CardDescription>
            {isPro && sp?.subscriptionExpiresAt
              ? `Lower commission on every sale. Renews ${new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(sp.subscriptionExpiresAt)}.`
              : `Cut your commission by ${proDiscount}% on every sale and get a Pro badge buyers trust.`}{" "}
            <Link
              href="/seller/subscription"
              className="font-medium text-primary underline-offset-4 hover:underline"
            >
              {isPro ? "Manage plan" : "See GETX Pro"}
            </Link>
          </CardDescription>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Grow your shop</CardTitle>
          <CardDescription>
            Listings with clear titles and honest descriptions sell first.
            Manage everything from{" "}
            <Link
              href="/seller/listings"
              className="font-medium text-primary underline-offset-4 hover:underline"
            >
              your listings
            </Link>
            .
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}
