import type { Metadata } from "next";
import Link from "next/link";
import { ShoppingBagIcon, ChevronRightIcon } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { getBuyerOrders } from "@/server/services/orders";
import { formatMoney } from "@/lib/money";
import { EmptyState } from "@/components/shared/empty-state";
import { CtaLink } from "@/components/shared/cta-link";
import { OrderStatusBadge } from "@/components/orders/order-status-badge";

export const metadata: Metadata = { title: "Your orders", robots: { index: false } };

const dateFmt = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium" });

export default async function OrdersPage() {
  const session = await requireUser();
  const orders = await getBuyerOrders(session.user.id);

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Your orders</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Track every purchase — payment, delivery and escrow status in one place.
        </p>
      </div>

      {orders.length === 0 ? (
        <EmptyState
          icon={<ShoppingBagIcon />}
          headingLevel="h2"
          title="No orders yet"
          description="When you buy a listing, it shows up here with live status and escrow protection."
          action={<CtaLink href="/marketplace">Browse marketplace</CtaLink>}
        />
      ) : (
        <ul className="flex flex-col gap-2.5">
          {orders.map((order) => (
            <li key={order.id}>
              <Link
                href={`/orders/${order.id}`}
                className="flex items-center gap-3 rounded-lg border border-border bg-card p-3.5 transition-colors hover:border-primary/40 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
              >
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-1 text-sm font-semibold">
                    {order.listingTitle}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {order.sellerName} · Qty {order.qty} ·{" "}
                    {dateFmt.format(order.createdAt)}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1.5">
                  <span className="font-heading text-sm font-bold tabular-nums">
                    {formatMoney(order.totalMinor, order.currency)}
                  </span>
                  <OrderStatusBadge status={order.status} />
                </div>
                <ChevronRightIcon
                  className="size-4 shrink-0 text-faint"
                  aria-hidden="true"
                />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
