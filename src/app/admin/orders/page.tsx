import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRightIcon } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { listAdminOrders } from "@/server/services/admin";
import { formatMoney } from "@/lib/money";
import { OrderStatusBadge } from "@/components/orders/order-status-badge";

export const metadata: Metadata = { title: "Orders — Admin" };

const dateFmt = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium" });

export default async function AdminOrdersPage() {
  await requireRole("ADMIN");
  const orders = await listAdminOrders();

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Orders</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          The latest orders across the platform. Open any one to see its ledger
          and timeline.
        </p>
      </div>

      {orders.length === 0 ? (
        <p className="rounded-lg border border-border bg-card/40 p-4 text-sm text-muted-foreground">
          No orders yet.
        </p>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {orders.map((o) => (
            <li key={o.id}>
              <Link
                href={`/orders/${o.id}`}
                className="flex items-center gap-3 rounded-lg border border-border bg-card p-3.5 transition-colors hover:border-primary/40 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
              >
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-1 text-sm font-semibold">
                    {o.listingTitle}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-faint">
                    {o.buyerEmail} → {o.sellerName} ·{" "}
                    {dateFmt.format(new Date(o.createdAt))}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1.5">
                  <span className="font-heading text-sm font-bold tabular-nums">
                    {formatMoney(o.totalMinor, o.currency)}
                  </span>
                  <OrderStatusBadge status={o.status} />
                </div>
                <ChevronRightIcon className="size-4 shrink-0 text-faint" aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
