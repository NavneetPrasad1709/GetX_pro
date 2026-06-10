import type { Metadata } from "next";
import Link from "next/link";
import type { FraudSeverity, FraudTargetType } from "@prisma/client";
import { requireRole } from "@/lib/auth";
import {
  listOpenFraudFlags,
  fraudQueueCounts,
} from "@/server/services/fraud/queue";
import { FraudFlagActions } from "@/components/admin/fraud-flag-actions";

export const metadata: Metadata = { title: "Fraud — Admin" };

const dateFmt = new Intl.DateTimeFormat("en-IN", {
  dateStyle: "medium",
  timeStyle: "short",
});

const SEVERITY_TONE: Record<FraudSeverity, string> = {
  CRITICAL: "bg-purple-500/15 text-purple-400",
  HIGH: "bg-destructive/15 text-destructive",
  MEDIUM: "bg-amber-500/15 text-amber-500",
  LOW: "bg-primary/15 text-primary",
};

/** Deep-link a flag's target to the right admin surface. */
function targetHref(type: FraudTargetType): string | null {
  switch (type) {
    case "USER":
      return "/admin/users";
    case "LISTING":
      return "/admin/listings";
    case "ORDER":
      return "/admin/orders";
    default:
      return null;
  }
}

export default async function AdminFraudPage() {
  await requireRole("ADMIN");
  const [flags, counts] = await Promise.all([
    listOpenFraudFlags(50),
    fraudQueueCounts(),
  ]);

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Fraud queue</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Open signals, most severe first. Dismiss false positives or escalate to
          an action. Every decision is audit-logged.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {(["CRITICAL", "HIGH", "MEDIUM", "LOW"] as const).map((s) => (
          <span
            key={s}
            className={`rounded-full px-3 py-1 text-xs font-semibold ${SEVERITY_TONE[s]}`}
          >
            {counts[s]} {s}
          </span>
        ))}
      </div>

      {flags.length === 0 ? (
        <p className="rounded-lg border border-border bg-card/40 p-4 text-sm text-muted-foreground">
          No open fraud flags. 🎉
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-border bg-card/60 text-left text-xs uppercase tracking-wide text-faint">
                <th className="px-3 py-2.5 font-medium">Severity</th>
                <th className="px-3 py-2.5 font-medium">Target</th>
                <th className="px-3 py-2.5 font-medium">Reason</th>
                <th className="px-3 py-2.5 font-medium">Auto-action</th>
                <th className="px-3 py-2.5 text-right font-medium">Risk</th>
                <th className="px-3 py-2.5 font-medium">When</th>
                <th className="px-3 py-2.5 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {flags.map((f) => {
                const href = targetHref(f.targetType);
                return (
                  <tr key={f.id} className="border-b border-border last:border-0 align-top">
                    <td className="px-3 py-2.5">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${SEVERITY_TONE[f.severity]}`}
                      >
                        {f.severity}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="text-xs text-muted-foreground">{f.targetType}</span>
                      <br />
                      {href ? (
                        <Link href={href} className="font-mono text-xs text-primary hover:underline">
                          {f.targetId.slice(-8)}
                        </Link>
                      ) : (
                        <span className="font-mono text-xs">{f.targetId.slice(-8)}</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 font-medium">{f.reason}</td>
                    <td className="px-3 py-2.5">
                      {f.autoAction === "NONE" ? (
                        <span className="text-xs text-faint">—</span>
                      ) : (
                        <span className="rounded-full bg-warning/15 px-2 py-0.5 text-[11px] font-semibold text-warning">
                          {f.autoAction}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{f.riskScore}</td>
                    <td className="px-3 py-2.5 text-xs text-muted-foreground">
                      {dateFmt.format(new Date(f.createdAt))}
                    </td>
                    <td className="px-3 py-2.5">
                      <FraudFlagActions flagId={f.id} isCritical={f.severity === "CRITICAL"} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
