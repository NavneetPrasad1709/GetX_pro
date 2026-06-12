import type { Metadata } from "next";
import { Suspense } from "react";
import { z } from "zod";
import { redirect } from "next/navigation";
import { BarChart3Icon, BanknoteIcon, LockIcon, ShoppingBagIcon, WalletIcon } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatMoney } from "@/lib/money";
import {
  getRevenueSeries,
  getOrderFunnel,
  getTopListings,
  getWalletSummary,
  getOrderCount,
} from "@/server/services/seller-analytics";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { RevenueChart } from "@/components/seller/charts/revenue-chart";
import { FunnelChart } from "@/components/seller/charts/funnel-chart";
import { DateRangePicker } from "@/components/seller/charts/date-range-picker";
import { TopListingsTable } from "@/components/seller/top-listings-table";

export const metadata: Metadata = { title: "Seller analytics", robots: { index: false } };
export const dynamic = "force-dynamic";

const daysSchema = z.enum(["7", "30", "90"]).catch("30");

type Props = { searchParams: Promise<{ days?: string }> };

export default async function SellerAnalyticsPage({ searchParams }: Props) {
  const session = await requireUser();
  const profile = await db.sellerProfile.findUnique({
    where: { userId: session.user.id },
    select: { id: true },
  });
  if (!profile) redirect("/become-seller");
  const sellerId = profile.id;

  const sp = await searchParams;
  const days = Number(daysSchema.parse(sp.days ?? "30"));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <BarChart3Icon className="size-6 text-primary" aria-hidden="true" />
            Your business
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Revenue, orders and listing performance — last {days} days.
          </p>
        </div>
        <DateRangePicker active={days} />
      </div>

      <Suspense key={`stats-${days}`} fallback={<StatCardsSkeleton />}>
        <StatCards sellerId={sellerId} days={days} />
      </Suspense>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Revenue</CardTitle>
            <CardDescription>Daily earnings (after commission)</CardDescription>
          </CardHeader>
          <CardContent>
            <Suspense key={`rev-${days}`} fallback={<ChartSkeleton />}>
              <RevenueSection sellerId={sellerId} days={days} />
            </Suspense>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Order funnel</CardTitle>
            <CardDescription>Where your orders are right now</CardDescription>
          </CardHeader>
          <CardContent>
            <Suspense key={`fun-${days}`} fallback={<ChartSkeleton />}>
              <FunnelSection sellerId={sellerId} days={days} />
            </Suspense>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Top listings</CardTitle>
          <CardDescription>
            Your best sellers this period — tap “Suggest” for an AI price check
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Suspense key={`top-${days}`} fallback={<TableSkeleton />}>
            <TopListingsSection sellerId={sellerId} days={days} />
          </Suspense>
        </CardContent>
      </Card>
    </div>
  );
}

// --- Streamed sections (each fetches its own slice; React.cache dedupes) ---

async function StatCards({ sellerId, days }: { sellerId: string; days: number }) {
  const [wallet, orders] = await Promise.all([
    getWalletSummary(sellerId),
    getOrderCount(sellerId, days),
  ]);
  const cards = [
    { icon: BanknoteIcon, label: "Total earned", value: formatMoney(wallet.totalEarnedMinor, "USD"), tone: "text-success" },
    { icon: WalletIcon, label: "Available", value: formatMoney(wallet.availableMinor, "USD"), tone: "text-foreground" },
    { icon: LockIcon, label: "In escrow", value: formatMoney(wallet.heldMinor, "USD"), tone: "text-warning" },
    { icon: ShoppingBagIcon, label: `Orders (${days}d)`, value: String(orders), tone: "text-foreground" },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {cards.map((c) => (
        <Card key={c.label} size="sm">
          <CardHeader>
            <CardDescription className="flex items-center gap-1.5">
              <c.icon className="size-3.5" aria-hidden="true" />
              {c.label}
            </CardDescription>
            <CardTitle className={`text-xl font-bold tabular-nums ${c.tone}`}>{c.value}</CardTitle>
          </CardHeader>
        </Card>
      ))}
    </div>
  );
}

async function RevenueSection({ sellerId, days }: { sellerId: string; days: number }) {
  const data = await getRevenueSeries(sellerId, days);
  return <RevenueChart data={data} />;
}

async function FunnelSection({ sellerId, days }: { sellerId: string; days: number }) {
  const data = await getOrderFunnel(sellerId, days);
  return <FunnelChart data={data} />;
}

async function TopListingsSection({ sellerId, days }: { sellerId: string; days: number }) {
  const data = await getTopListings(sellerId, days);
  return <TopListingsTable listings={data} currency="USD" />;
}

// --- Skeletons ---

function StatCardsSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="h-[76px] animate-pulse rounded-xl border border-border bg-card" />
      ))}
    </div>
  );
}

function ChartSkeleton() {
  return <div className="h-[260px] animate-pulse rounded-lg bg-muted/40" />;
}

function TableSkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="h-10 animate-pulse rounded-md bg-muted/40" />
      ))}
    </div>
  );
}
