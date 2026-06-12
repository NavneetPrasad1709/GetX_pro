import type { Metadata } from "next";
import Link from "next/link";
import {
  BanknoteIcon,
  GavelIcon,
  ShieldCheckIcon,
  type LucideIcon,
} from "lucide-react";
import { requireRole } from "@/lib/auth";
import { getAdminDashboard } from "@/server/services/admin";
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

export const metadata: Metadata = { title: "Admin" };

export default async function AdminPage() {
  await requireRole("ADMIN"); // defense in depth — layout checks too
  const [d, funnel] = await Promise.all([
    getAdminDashboard(),
    getSellerActivationFunnel(),
  ]);

  // Seller activation funnel rows (Prompt 14): count + % of the FIRST step.
  const funnelRows = [
    { label: "Registered as seller", count: funnel.totalRegistered },
    { label: "Submitted KYC", count: funnel.kycSubmitted },
    { label: "KYC approved", count: funnel.kycApproved },
    { label: "Published a listing", count: funnel.firstListingPublished },
    { label: "Closed first sale", count: funnel.firstSaleClosed },
  ];
  const funnelTop = funnel.totalRegistered;

  const stats = [
    { label: "Users", value: d.users.toLocaleString("en-US") },
    { label: "Sellers", value: d.sellers.toLocaleString("en-US") },
    { label: "Active listings", value: d.activeListings.toLocaleString("en-US") },
    { label: "Orders", value: d.orders.toLocaleString("en-US") },
    { label: "GMV (completed)", value: formatMoney(d.gmvMinor) },
  ];

  const queues: {
    href: string;
    icon: LucideIcon;
    label: string;
    count: number;
    blurb: string;
  }[] = [
    {
      href: "/admin/disputes",
      icon: GavelIcon,
      label: "Open disputes",
      count: d.openDisputes,
      blurb: "Resolve refund or release",
    },
    {
      href: "/admin/kyc",
      icon: ShieldCheckIcon,
      label: "Pending KYC",
      count: d.pendingKyc,
      blurb: "Review seller IDs",
    },
    {
      href: "/admin/payouts",
      icon: BanknoteIcon,
      label: "Payouts to action",
      count: d.pendingPayouts,
      blurb: "Pay and mark complete",
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Control room</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Everything you need to keep GETX safe and running.
        </p>
      </div>

      {/* actionable queues first */}
      <div className="grid grid-cols-1 gap-3 min-[521px]:grid-cols-3">
        {queues.map((q) => (
          <Link
            key={q.href}
            href={q.href}
            className="flex items-center gap-3 rounded-lg border border-border bg-card p-4 transition-colors hover:border-primary/40 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            <span
              className={cn(
                "grid size-11 place-items-center rounded-full",
                q.count > 0 ? "bg-warning/12 text-warning" : "bg-muted text-muted-foreground",
              )}
            >
              <q.icon className="size-5" aria-hidden="true" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-baseline gap-2">
                <span className="font-heading text-2xl font-bold tabular-nums">
                  {q.count}
                </span>
                <span className="text-sm font-semibold">{q.label}</span>
              </span>
              <span className="block text-xs text-muted-foreground">{q.blurb}</span>
            </span>
          </Link>
        ))}
      </div>

      {/* platform stats */}
      <div className="grid grid-cols-2 gap-3 min-[521px]:grid-cols-5">
        {stats.map((s) => (
          <Card key={s.label} size="sm">
            <CardHeader>
              <CardDescription>{s.label}</CardDescription>
              <CardTitle className="text-xl font-bold tabular-nums">
                {s.value}
              </CardTitle>
            </CardHeader>
          </Card>
        ))}
      </div>

      {/* seller activation funnel (Prompt 14) */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Seller activation funnel</CardTitle>
          <CardDescription>
            Where sellers drop off between signup and first sale. End-to-end:{" "}
            <span className="font-semibold text-foreground">
              {Math.round(funnel.rates.end2endRate * 100)}%
            </span>{" "}
            reach a first sale.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <ol className="flex min-w-[420px] flex-col gap-2">
              {funnelRows.map((row, i) => {
                const pctOfTop =
                  funnelTop > 0 ? Math.round((row.count / funnelTop) * 100) : 0;
                const prev = i > 0 ? funnelRows[i - 1].count : row.count;
                const stepPct =
                  prev > 0 ? Math.round((row.count / prev) * 100) : 0;
                return (
                  <li key={row.label} className="flex items-center gap-3 text-sm">
                    <span className="w-44 shrink-0 text-muted-foreground">
                      {row.label}
                    </span>
                    <span className="relative h-6 flex-1 overflow-hidden rounded bg-muted">
                      <span
                        className="absolute inset-y-0 left-0 rounded bg-primary/70"
                        style={{ width: `${Math.max(pctOfTop, 2)}%` }}
                        aria-hidden="true"
                      />
                    </span>
                    <span className="w-12 shrink-0 text-right font-semibold tabular-nums">
                      {row.count}
                    </span>
                    <span className="w-14 shrink-0 text-right text-xs text-faint tabular-nums">
                      {i === 0 ? "—" : `${stepPct}%`}
                    </span>
                  </li>
                );
              })}
            </ol>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Moderation</CardTitle>
          <CardDescription>
            Manage <Link href="/admin/users" className="font-medium text-primary underline-offset-4 hover:underline">users</Link>,{" "}
            <Link href="/admin/listings" className="font-medium text-primary underline-offset-4 hover:underline">listings</Link>{" "}
            and <Link href="/admin/orders" className="font-medium text-primary underline-offset-4 hover:underline">orders</Link>.
            Every action is audit-logged.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-xs text-muted-foreground">
          Promote a user to admin from{" "}
          <Link href="/admin/users" className="font-medium text-primary underline-offset-4 hover:underline">
            Users
          </Link>{" "}
          → Make admin.
        </CardContent>
      </Card>
    </div>
  );
}
