import type { Metadata } from "next";
import { requireRole } from "@/lib/auth";
import { getOpsMetrics, listOpenTickets } from "@/server/services/work-queue";
import { cn } from "@/lib/utils";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata: Metadata = { title: "Ops", robots: { index: false } };
export const dynamic = "force-dynamic";

const TYPE_LABEL: Record<string, string> = {
  DISPUTE: "Disputes",
  KYC: "KYC",
  FRAUD_FLAG: "Fraud",
  PAYOUT_REVIEW: "Payouts",
  SUPPORT: "Support",
};
const PRIORITY_TONE: Record<string, string> = {
  CRITICAL: "bg-destructive/15 text-destructive",
  HIGH: "bg-warning/15 text-warning",
  NORMAL: "bg-muted text-muted-foreground",
  LOW: "bg-muted text-faint",
};

function attainmentTone(pct: number): string {
  if (pct >= 90) return "text-success";
  if (pct >= 70) return "text-warning";
  return "text-destructive";
}
function timeLeft(iso: string): { label: string; breached: boolean } {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms < 0) return { label: "overdue", breached: true };
  const h = Math.floor(ms / 3_600_000);
  return { label: h >= 24 ? `${Math.floor(h / 24)}d` : `${h}h`, breached: false };
}

export default async function OpsPage() {
  await requireRole("ADMIN");
  const [metrics, queue] = await Promise.all([getOpsMetrics(), listOpenTickets({ limit: 40 })]);

  const breachedByType = queue.reduce<Record<string, number>>((acc, t) => {
    if (t.slaBreached) acc[t.type] = (acc[t.type] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Operations</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          SLA-tracked work queue — most urgent first. Breached tickets escalate to CRITICAL.
        </p>
      </div>

      {/* Queue overview by type */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {(Object.keys(TYPE_LABEL) as string[]).map((type) => {
          const count = metrics.queueDepth[type as keyof typeof metrics.queueDepth] ?? 0;
          const breached = breachedByType[type] ?? 0;
          return (
            <Card key={type} size="sm">
              <CardHeader>
                <CardDescription>{TYPE_LABEL[type]}</CardDescription>
                <CardTitle className="flex items-baseline gap-2 text-xl font-bold tabular-nums">
                  {count}
                  {breached > 0 ? (
                    <span className="rounded-full bg-destructive/15 px-1.5 text-[11px] font-semibold text-destructive">
                      {breached} late
                    </span>
                  ) : null}
                </CardTitle>
              </CardHeader>
            </Card>
          );
        })}
      </div>

      {/* Ops health strip */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card size="sm">
          <CardHeader>
            <CardDescription>SLA attainment (7d)</CardDescription>
            <CardTitle className={cn("text-xl font-bold tabular-nums", attainmentTone(metrics.slaAttainmentPct))}>
              {metrics.slaAttainmentPct}%
            </CardTitle>
          </CardHeader>
        </Card>
        <Card size="sm">
          <CardHeader>
            <CardDescription>Median resolution (7d)</CardDescription>
            <CardTitle className="text-xl font-bold tabular-nums">{metrics.medianResolutionHours}h</CardTitle>
          </CardHeader>
        </Card>
        <Card size="sm">
          <CardHeader>
            <CardDescription>Auto-resolved (7d)</CardDescription>
            <CardTitle className="text-xl font-bold tabular-nums">{metrics.autoResolutionPct}%</CardTitle>
          </CardHeader>
        </Card>
        <Card size="sm">
          <CardHeader>
            <CardDescription>Open HIGH / CRITICAL</CardDescription>
            <CardTitle
              className={cn(
                "text-xl font-bold tabular-nums",
                metrics.breachedOpen > 0 ? "text-destructive" : undefined,
              )}
            >
              {metrics.highPriorityOpen}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* The queue */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Open queue</CardTitle>
          <CardDescription>
            {queue.length} open ticket{queue.length === 1 ? "" : "s"} ·{" "}
            <span className={metrics.breachedOpen > 0 ? "font-semibold text-destructive" : undefined}>
              {metrics.breachedOpen} past SLA
            </span>
          </CardDescription>
        </CardHeader>
        <CardContent>
          {queue.length === 0 ? (
            <p className="text-sm text-muted-foreground">Queue is clear — nothing waiting.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground">
                    <th className="pb-2 font-medium">Priority</th>
                    <th className="pb-2 font-medium">Type</th>
                    <th className="pb-2 font-medium">Title</th>
                    <th className="pb-2 font-medium">Assignee</th>
                    <th className="pb-2 text-right font-medium">SLA</th>
                  </tr>
                </thead>
                <tbody>
                  {queue.map((t) => {
                    const sla = timeLeft(t.slaDeadlineAt);
                    return (
                      <tr key={t.id} className="border-t border-border">
                        <td className="py-2">
                          <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", PRIORITY_TONE[t.priority])}>
                            {t.priority}
                          </span>
                        </td>
                        <td className="py-2 text-muted-foreground">{TYPE_LABEL[t.type] ?? t.type}</td>
                        <td className="max-w-[280px] truncate py-2">{t.title}</td>
                        <td className="py-2 text-muted-foreground">{t.assignedToName ?? "—"}</td>
                        <td
                          className={cn(
                            "py-2 text-right tabular-nums",
                            sla.breached ? "font-semibold text-destructive" : "text-muted-foreground",
                          )}
                        >
                          {sla.label}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Agent load */}
      {metrics.agentLoad.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Agent load</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col gap-1.5 text-sm">
              {metrics.agentLoad.map((a) => (
                <li key={a.agentId} className="flex items-center justify-between">
                  <span>{a.agentName}</span>
                  <span className="font-semibold tabular-nums">{a.openCount} open</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
