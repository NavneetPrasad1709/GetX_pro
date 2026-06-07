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
import { getSellerStats } from "@/server/services/listings";
import { formatMoney } from "@/lib/money";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata: Metadata = { title: "Seller overview" };

/**
 * Seller home — the CEO view starts simple (Step 06): live counts, money in
 * motion, wallet truth from the ledger. Charts/AI pricing arrive in Step 20.
 */
export default async function SellerOverviewPage() {
  const session = await requireUser();
  const stats = await getSellerStats(session.user.id);

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
      hint: "Computed from your ledger — payouts in Step 14",
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
