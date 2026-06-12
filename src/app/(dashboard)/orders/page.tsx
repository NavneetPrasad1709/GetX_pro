import type { Metadata } from "next";
import Link from "next/link";
import type { OrderStatus } from "@prisma/client";
import { ShoppingBagIcon, ChevronRightIcon } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { getBuyerOrders } from "@/server/services/orders";
import { formatMoney } from "@/lib/money";
import { EmptyState } from "@/components/shared/empty-state";
import { CtaLink } from "@/components/shared/cta-link";
import { OrderStatusBadge } from "@/components/orders/order-status-badge";
import {
  OrderStatusTabs,
  parseOrderFilter,
  type OrderFilter,
} from "@/components/dashboard/order-status-tabs";

export const metadata: Metadata = { title: "Your orders", robots: { index: false } };

const dateFmt = new Intl.DateTimeFormat("en-US", { dateStyle: "medium" });

// Buyer status → filter mapping (Prompt 06).
const BUYER_FILTER: Record<Exclude<OrderFilter, "all">, OrderStatus[]> = {
  needs_action: ["DELIVERED"],
  active: ["AWAITING_PAYMENT", "PAID", "DELIVERED"],
  completed: ["COMPLETED", "REFUNDED"],
  disputed: ["DISPUTED"],
};

type Props = {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

export default async function OrdersPage({ searchParams }: Props) {
  const session = await requireUser();
  const orders = await getBuyerOrders(session.user.id);
  const filter = parseOrderFilter((await searchParams).filter);

  const counts: Record<OrderFilter, number> = {
    all: orders.length,
    needs_action: orders.filter((o) => BUYER_FILTER.needs_action.includes(o.status)).length,
    active: orders.filter((o) => BUYER_FILTER.active.includes(o.status)).length,
    completed: orders.filter((o) => BUYER_FILTER.completed.includes(o.status)).length,
    disputed: orders.filter((o) => BUYER_FILTER.disputed.includes(o.status)).length,
  };
  const visible =
    filter === "all" ? orders : orders.filter((o) => BUYER_FILTER[filter].includes(o.status));

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
          description="When you buy a listing, your escrow-protected order appears here. Every trade is insured."
          action={<CtaLink href="/games">Browse games</CtaLink>}
        />
      ) : (
        <>
          <OrderStatusTabs counts={counts} current={filter} />

          {counts.needs_action > 0 ? (
            <div className="rounded-lg border border-primary/30 bg-primary/5 p-3.5 text-sm">
              <p className="font-semibold">
                {counts.needs_action} order{counts.needs_action === 1 ? "" : "s"} delivered
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Confirm receipt to release escrow and leave a review.
              </p>
            </div>
          ) : null}

          {visible.length === 0 ? (
            <p className="rounded-lg border border-border bg-card/40 p-4 text-sm text-muted-foreground">
              No orders in this view.
            </p>
          ) : (
            <ul className="flex flex-col gap-2.5">
              {visible.map((order) => (
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
        </>
      )}
    </div>
  );
}
