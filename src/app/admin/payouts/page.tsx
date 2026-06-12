import type { Metadata } from "next";
import { requireRole } from "@/lib/auth";
import { listPayouts } from "@/server/services/payouts";
import { formatMoney } from "@/lib/money";
import { PayoutStatusBadge } from "@/components/wallet/payout-status-badge";
import { PayoutActions } from "@/components/admin/payout-actions";

export const metadata: Metadata = { title: "Payouts — Admin" };

const dateFmt = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
});
const METHOD_LABEL: Record<string, string> = {
  RAZORPAY: "Bank / UPI",
  CRYPTO: "Crypto",
};

export default async function AdminPayoutsPage() {
  await requireRole("ADMIN");
  const [pending, recent] = await Promise.all([
    listPayouts(["REQUESTED", "PROCESSING"]),
    listPayouts(["PAID", "FAILED"]),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Payouts</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Send the money, then mark each request paid. Failing a payout reverses
          the reserved funds back to the seller&apos;s balance.
        </p>
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="font-heading text-lg font-bold">
          Pending ({pending.length})
        </h2>
        {pending.length === 0 ? (
          <p className="rounded-lg border border-border bg-card/40 p-4 text-sm text-muted-foreground">
            No payouts waiting. 🎉
          </p>
        ) : (
          <ul className="flex flex-col gap-2.5">
            {pending.map((p) => (
              <li
                key={p.id}
                className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4 min-[761px]:flex-row min-[761px]:items-center min-[761px]:justify-between"
              >
                <div className="min-w-0">
                  <p className="font-semibold">
                    {formatMoney(p.amountMinor, p.currency)}{" "}
                    <span className="text-xs font-normal text-muted-foreground">
                      via {METHOD_LABEL[p.method] ?? p.method}
                    </span>
                    {p.isInstant ? (
                      <span className="ml-2 rounded-full bg-warning/15 px-2 py-0.5 text-[10px] font-bold tracking-wide text-warning align-middle">
                        INSTANT
                      </span>
                    ) : null}
                  </p>
                  <p className="mt-0.5 text-xs text-faint">
                    {p.sellerName} · {dateFmt.format(new Date(p.createdAt))} ·{" "}
                    <span className="font-mono">#{p.id.slice(-8).toUpperCase()}</span>
                  </p>
                </div>
                <PayoutActions payoutId={p.id} />
              </li>
            ))}
          </ul>
        )}
      </section>

      {recent.length > 0 ? (
        <section className="flex flex-col gap-3">
          <h2 className="font-heading text-lg font-bold">Recently processed</h2>
          <ul className="flex flex-col divide-y divide-border rounded-lg border border-border bg-card">
            {recent.map((p) => (
              <li key={p.id} className="flex items-center gap-3 p-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold tabular-nums">
                    {formatMoney(p.amountMinor, p.currency)}
                  </p>
                  <p className="text-xs text-faint">
                    {p.sellerName} · {METHOD_LABEL[p.method] ?? p.method} ·{" "}
                    {dateFmt.format(new Date(p.createdAt))}
                  </p>
                </div>
                <PayoutStatusBadge status={p.status} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
