import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import {
  getRevenueAndGmvTrend,
  getOrderFunnel,
  getTrustHealthSnapshot,
  getTopGamesByRevenue,
  getRevenueByCategoryKind,
  getNewSellerMonthlyActivation,
  getTakeRateSeries,
} from "@/server/services/founder-analytics";
import { getSellerActivationFunnel } from "@/server/services/analytics";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { GmvRevenueChart } from "@/components/admin/analytics/gmv-revenue-chart";
import { TrendingSearches } from "@/components/admin/analytics/trending-searches";

export const metadata: Metadata = { title: "Analytics", robots: { index: false } };

const daysSchema = z.enum(["7", "30", "90"]).default("30");

type Props = { searchParams: Promise<{ days?: string | string[] }>; };

function StatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "warning" | "danger";
}) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle
          className={cn(
            "text-xl font-bold tabular-nums",
            tone === "warning" && "text-warning",
            tone === "danger" && "text-destructive",
          )}
        >
          {value}
        </CardTitle>
      </CardHeader>
    </Card>
  );
}

function disputeTone(rate: number): "warning" | "danger" | undefined {
  if (rate > 6) return "danger";
  if (rate > 3) return "warning";
  return undefined;
}
function activationTone(rate: number): string {
  if (rate >= 30) return "text-success";
  if (rate >= 10) return "text-warning";
  return "text-destructive";
}

export default async function AnalyticsPage({ searchParams }: Props) {
  await requireRole("ADMIN"); // defense in depth — layout checks too

  const sp = await searchParams;
  const raw = Array.isArray(sp.days) ? sp.days[0] : sp.days;
  const days = Number(daysSchema.catch("30").parse(raw));

  const [trend, funnel, trust, sellerFunnel, topGames, byCategory, cohorts] =
    await Promise.all([
      getRevenueAndGmvTrend(days),
      getOrderFunnel(days),
      getTrustHealthSnapshot(),
      getSellerActivationFunnel(),
      getTopGamesByRevenue(days),
      getRevenueByCategoryKind(days),
      getNewSellerMonthlyActivation(6),
    ]);
  const takeRate = getTakeRateSeries(trend); // pure transform (kept for tooltip parity)
  void takeRate;

  const totalGmv = trend.reduce((s, d) => s + d.gmvMinor, 0);
  const totalRevenue = trend.reduce((s, d) => s + d.revenueMinor, 0);
  const effectiveTakeRate =
    totalGmv > 0 ? ((totalRevenue / totalGmv) * 100).toFixed(2) : "0.00";

  const sellerSteps = [
    { label: "Registered", count: sellerFunnel.totalRegistered },
    { label: "KYC submitted", count: sellerFunnel.kycSubmitted },
    { label: "KYC approved", count: sellerFunnel.kycApproved },
    { label: "First listing", count: sellerFunnel.firstListingPublished },
    { label: "First sale", count: sellerFunnel.firstSaleClosed },
  ];

  const ranges = ["7", "30", "90"] as const;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Analytics</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Is the marketplace growing, healthy, and worth doubling down on?
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {ranges.map((r) => (
            <Link
              key={r}
              href={`/admin/analytics?days=${r}`}
              aria-current={String(days) === r ? "page" : undefined}
              className={cn(
                "min-w-11 rounded-md px-3 py-2 text-center text-sm font-medium transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                String(days) === r
                  ? "bg-primary/10 font-semibold text-primary"
                  : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
              )}
            >
              {r}d
            </Link>
          ))}
        </div>
      </div>

      {/* Trending searches (Step 26) — demand signal from the search log */}
      <Suspense fallback={null}>
        <TrendingSearches />
      </Suspense>

      {/* Section 1 — business at a glance */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard label={`GMV (${days}d)`} value={formatMoney(totalGmv)} />
        <StatCard label={`Revenue (${days}d)`} value={formatMoney(totalRevenue)} />
        <StatCard label="Effective take-rate" value={`${effectiveTakeRate}%`} />
        <StatCard label="Orders completed" value={funnel.completed.toLocaleString("en-US")} />
        <StatCard label="Completion rate" value={`${funnel.completionRate}%`} />
        <StatCard
          label="Dispute rate"
          value={`${funnel.disputeRate}%`}
          tone={disputeTone(funnel.disputeRate)}
        />
      </div>

      {/* Section 2 — GMV + revenue trend */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">GMV + revenue trend</CardTitle>
          <CardDescription>
            Daily completed-order GMV vs platform fee revenue (last {days} days).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <GmvRevenueChart data={trend} />
        </CardContent>
      </Card>

      {/* Section 3 — order funnel */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Order funnel ({days}d)</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: "Created", value: funnel.created },
              { label: "Paid", value: funnel.paid },
              { label: "Completed", value: funnel.completed },
              { label: "Disputed / refunded", value: funnel.disputed + funnel.refunded },
            ].map((f) => (
              <div key={f.label} className="rounded-lg border border-border bg-card p-3">
                <p className="text-xs text-muted-foreground">{f.label}</p>
                <p className="font-heading text-2xl font-bold tabular-nums">{f.value}</p>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            <Badge label="Completion" value={`${funnel.completionRate}%`} />
            <Badge
              label="Dispute"
              value={`${funnel.disputeRate}%`}
              tone={disputeTone(funnel.disputeRate)}
            />
            <Badge label="Refund" value={`${funnel.refundRate}%`} />
          </div>
        </CardContent>
      </Card>

      {/* Section 4 — trust health */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Avg seller rating" value={`${trust.avgSellerRating.toFixed(2)} ★`} />
        <StatCard label="KYC-verified sellers" value={`${trust.kycVerifiedPercent}%`} />
        <StatCard label="Active sellers (30d)" value={trust.activeSellersLast30d.toLocaleString("en-US")} />
        <StatCard label="Sellers with 0 sales" value={trust.sellersWith0Sales.toLocaleString("en-US")} />
      </div>

      {/* Section 5 — seller funnel */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Seller funnel</CardTitle>
          <CardDescription>Where sellers drop off between signup and first sale.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <ol className="flex min-w-[420px] flex-col gap-2">
              {sellerSteps.map((row, i) => {
                const top = sellerSteps[0].count;
                const pctOfTop = top > 0 ? Math.round((row.count / top) * 100) : 0;
                const prev = i > 0 ? sellerSteps[i - 1].count : row.count;
                const stepPct = prev > 0 ? Math.round((row.count / prev) * 100) : 0;
                return (
                  <li key={row.label} className="flex items-center gap-3 text-sm">
                    <span className="w-32 shrink-0 text-muted-foreground">{row.label}</span>
                    <span className="relative h-6 flex-1 overflow-hidden rounded bg-muted">
                      <span
                        className="absolute inset-y-0 left-0 rounded bg-primary/70"
                        style={{ width: `${Math.max(pctOfTop, 2)}%` }}
                        aria-hidden="true"
                      />
                    </span>
                    <span className="w-12 shrink-0 text-right font-semibold tabular-nums">{row.count}</span>
                    <span className="hidden w-14 shrink-0 text-right text-xs text-faint tabular-nums sm:block">
                      {i === 0 ? "—" : `${stepPct}%`}
                    </span>
                  </li>
                );
              })}
            </ol>
          </div>
        </CardContent>
      </Card>

      {/* Section 6 — revenue by game + category */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Top games by revenue ({days}d)</CardTitle>
          </CardHeader>
          <CardContent>
            {topGames.length === 0 ? (
              <p className="text-sm text-muted-foreground">No completed orders in this window.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[360px] text-sm">
                  <thead>
                    <tr className="text-left text-xs text-muted-foreground">
                      <th className="pb-2 font-medium">Game</th>
                      <th className="pb-2 text-right font-medium">Revenue</th>
                      <th className="pb-2 text-right font-medium">GMV</th>
                      <th className="pb-2 text-right font-medium">Orders</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topGames.map((g) => (
                      <tr key={g.gameId} className="border-t border-border">
                        <td className="py-2">{g.gameName}</td>
                        <td className="py-2 text-right tabular-nums">{formatMoney(g.revenueMinor)}</td>
                        <td className="py-2 text-right tabular-nums text-muted-foreground">{formatMoney(g.gmvMinor)}</td>
                        <td className="py-2 text-right tabular-nums">{g.orderCount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Revenue by category</CardTitle>
          </CardHeader>
          <CardContent>
            {byCategory.length === 0 ? (
              <p className="text-sm text-muted-foreground">No completed orders in this window.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[360px] text-sm">
                  <thead>
                    <tr className="text-left text-xs text-muted-foreground">
                      <th className="pb-2 font-medium">Kind</th>
                      <th className="pb-2 text-right font-medium">Revenue</th>
                      <th className="pb-2 text-right font-medium">GMV</th>
                      <th className="pb-2 text-right font-medium">Share</th>
                    </tr>
                  </thead>
                  <tbody>
                    {byCategory.map((c) => (
                      <tr key={c.kind} className="border-t border-border">
                        <td className="py-2">{c.kind}</td>
                        <td className="py-2 text-right tabular-nums">{formatMoney(c.revenueMinor)}</td>
                        <td className="py-2 text-right tabular-nums text-muted-foreground">{formatMoney(c.gmvMinor)}</td>
                        <td className="py-2 text-right tabular-nums">{c.sharePercent}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Section 7 — new seller activation cohorts */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">New-seller activation cohorts</CardTitle>
          <CardDescription>
            Of sellers who joined in a month, how many made their first sale that same month.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {cohorts.length === 0 ? (
            <p className="text-sm text-muted-foreground">No seller cohorts yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[420px] text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground">
                    <th className="pb-2 font-medium">Month</th>
                    <th className="pb-2 text-right font-medium">New sellers</th>
                    <th className="pb-2 text-right font-medium">First sale</th>
                    <th className="pb-2 text-right font-medium">Activation</th>
                  </tr>
                </thead>
                <tbody>
                  {cohorts.map((m) => (
                    <tr key={m.month} className="border-t border-border">
                      <td className="py-2">{m.month}</td>
                      <td className="py-2 text-right tabular-nums">{m.newSellers}</td>
                      <td className="py-2 text-right tabular-nums">{m.firstSaleInMonth}</td>
                      <td className={cn("py-2 text-right font-semibold tabular-nums", activationTone(m.activationRate))}>
                        {m.activationRate}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Badge({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "warning" | "danger";
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-medium",
        tone === "danger"
          ? "border-destructive/30 bg-destructive/10 text-destructive"
          : tone === "warning"
            ? "border-warning/30 bg-warning/10 text-warning"
            : "border-border bg-muted/40 text-muted-foreground",
      )}
    >
      {label} <span className="tabular-nums text-foreground">{value}</span>
    </span>
  );
}
