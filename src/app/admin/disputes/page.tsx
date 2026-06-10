import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRightIcon } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { listOpenDisputes } from "@/server/services/admin";
import { formatMoney } from "@/lib/money";

export const metadata: Metadata = { title: "Disputes — Admin" };

const dateFmt = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium" });

export default async function AdminDisputesPage() {
  await requireRole("ADMIN");
  const queue = await listOpenDisputes();

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Open disputes</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Review the order, delivery proof and chat, then refund the buyer or
          release to the seller. Money moves through the escrow ledger.
        </p>
      </div>

      {queue.length === 0 ? (
        <p className="rounded-lg border border-border bg-card/40 p-4 text-sm text-muted-foreground">
          No open disputes. 🎉
        </p>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {queue.map((d) => (
            <li key={d.orderId}>
              <Link
                href={`/admin/disputes/${d.orderId}`}
                className="flex items-center gap-3 rounded-lg border border-border bg-card p-4 transition-colors hover:border-primary/40 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
              >
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-1 text-sm font-semibold">
                    {d.listingTitle}
                  </p>
                  <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
                    {d.openedByName} · {dateFmt.format(new Date(d.createdAt))} ·{" "}
                    {d.reason}
                  </p>
                </div>
                <span className="shrink-0 font-heading text-sm font-bold tabular-nums">
                  {formatMoney(d.amountMinor, d.currency)}
                </span>
                <ChevronRightIcon className="size-4 shrink-0 text-faint" aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
