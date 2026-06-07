import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRightIcon } from "lucide-react";
import type { OrderStatus } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { getOrder } from "@/server/services/orders";
import { formatMoney } from "@/lib/money";
import { Breadcrumbs } from "@/components/shared/breadcrumbs";
import { OrderStatusBadge } from "@/components/orders/order-status-badge";
import { PayNow } from "@/components/orders/pay-now";
import { PaymentStatusPoller } from "@/components/orders/payment-status-poller";

export const metadata: Metadata = { title: "Order", robots: { index: false } };

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

const NEXT_STEP: Partial<Record<OrderStatus, string>> = {
  AWAITING_PAYMENT:
    "Complete payment to lock your money in escrow. The seller is notified the moment it clears.",
  UNDERPAID:
    "We received a partial payment — our support team will reconcile or refund it. You don't need to do anything right now.",
  PAID: "Your payment is safe in escrow. The seller will deliver shortly — you'll be notified.",
  DELIVERED:
    "Delivered! Check everything is as described, then confirm to release payment — or open a dispute.",
  COMPLETED: "Order complete and payment released. Thanks for trading on GETX!",
  DISPUTED: "A dispute is open. Our team will review and resolve it fairly.",
  REFUNDED: "This order was refunded to your original payment method.",
  CANCELLED: "This order was cancelled. No payment was taken.",
  EXPIRED: "This order expired before payment. Start a new one anytime.",
};

const dateFmt = new Intl.DateTimeFormat("en-IN", {
  dateStyle: "medium",
  timeStyle: "short",
});

export default async function OrderPage({ params, searchParams }: Props) {
  const session = await requireUser();
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const order = await getOrder(
    { id: session.user.id, role: session.user.role },
    id,
  );
  if (!order) notFound();

  const subtotalMinor = order.unitPriceMinor * order.qty;
  const isBuyer = order.buyerId === session.user.id;
  // "?confirming=1" only changes which WAITING UI we show — the order status
  // itself always comes from the DB (webhook = truth, never the redirect).
  const confirming =
    order.status === "AWAITING_PAYMENT" &&
    (Array.isArray(sp.confirming) ? sp.confirming[0] : sp.confirming) === "1";

  return (
    <div className="flex flex-col gap-5">
      <Breadcrumbs
        items={[
          { label: "Home", href: "/" },
          { label: "Orders", href: "/orders" },
          { label: "Order details" },
        ]}
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Order</h1>
          <p className="mt-0.5 font-mono text-xs text-faint">
            #{order.id.slice(-8).toUpperCase()} · {dateFmt.format(order.createdAt)}
          </p>
        </div>
        <OrderStatusBadge status={order.status} />
      </div>

      {/* what happens next */}
      {NEXT_STEP[order.status] ? (
        <p className="rounded-lg border border-border bg-card/50 p-4 text-sm text-muted-foreground">
          {NEXT_STEP[order.status]}
        </p>
      ) : null}

      {/* line item */}
      <div className="rounded-lg border border-border bg-card p-4">
        <Link
          href={`/listing/${order.listing.slug}`}
          className="group/li inline-flex items-center gap-1.5 text-sm font-semibold hover:text-primary"
        >
          {order.listing.title}
          <ArrowRightIcon
            className="size-3.5 opacity-60 transition-transform group-hover/li:translate-x-0.5"
            aria-hidden="true"
          />
        </Link>
        <p className="mt-1 text-xs text-muted-foreground">
          Sold by {order.seller.displayName} · Qty {order.qty}
        </p>
      </div>

      {/* totals */}
      <dl className="flex flex-col gap-2 rounded-lg border border-border bg-card p-4 text-sm">
        <div className="flex items-center justify-between">
          <dt className="text-muted-foreground">
            Subtotal ({order.qty} × {formatMoney(order.unitPriceMinor, order.currency)})
          </dt>
          <dd className="tabular-nums">{formatMoney(subtotalMinor, order.currency)}</dd>
        </div>
        <div className="flex items-center justify-between">
          <dt className="text-muted-foreground">Platform fee</dt>
          <dd className="tabular-nums">{formatMoney(order.feeMinor, order.currency)}</dd>
        </div>
        <div className="mt-1 flex items-center justify-between border-t border-border pt-2.5">
          <dt className="font-semibold">Total</dt>
          <dd className="font-heading text-lg font-bold tabular-nums">
            {formatMoney(order.totalMinor, order.currency)}
          </dd>
        </div>
      </dl>

      {/* pay now (buyer only) — webhook decides the real status, never the redirect */}
      {order.status === "AWAITING_PAYMENT" && isBuyer ? (
        confirming ? (
          <div className="flex flex-col gap-2">
            <PaymentStatusPoller />
            <Link
              href={`/orders/${order.id}`}
              className="text-xs font-semibold text-primary hover:text-primary-hover"
            >
              Didn&apos;t complete the payment? Pay again →
            </Link>
          </div>
        ) : (
          <PayNow
            orderId={order.id}
            totalMinor={order.totalMinor}
            currency={order.currency}
            initialProvider={order.paymentProvider}
          />
        )
      ) : null}

      <Link
        href="/orders"
        className="text-sm font-semibold text-primary hover:text-primary-hover"
      >
        ← All orders
      </Link>
    </div>
  );
}
