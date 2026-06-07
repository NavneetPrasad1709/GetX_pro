import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LockIcon, ArrowRightIcon } from "lucide-react";
import type { OrderStatus } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { getOrder } from "@/server/services/orders";
import { formatMoney } from "@/lib/money";
import { Breadcrumbs } from "@/components/shared/breadcrumbs";
import { OrderStatusBadge } from "@/components/orders/order-status-badge";

export const metadata: Metadata = { title: "Order", robots: { index: false } };

type Props = { params: Promise<{ id: string }> };

const NEXT_STEP: Partial<Record<OrderStatus, string>> = {
  AWAITING_PAYMENT:
    "Complete payment to lock your money in escrow. The seller is notified the moment it clears.",
  UNDERPAID: "We received a partial payment — pay the remaining balance to proceed.",
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

export default async function OrderPage({ params }: Props) {
  const session = await requireUser();
  const { id } = await params;
  const order = await getOrder(
    { id: session.user.id, role: session.user.role },
    id,
  );
  if (!order) notFound();

  const subtotalMinor = order.unitPriceMinor * order.qty;

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

      {/* pay now — placeholder until Step 09 wires the gateway */}
      {order.status === "AWAITING_PAYMENT" ? (
        <div className="flex flex-col gap-2 rounded-lg border border-dashed border-primary/40 bg-primary/5 p-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-primary-hover">
            <LockIcon className="size-4" aria-hidden="true" />
            Payment
          </div>
          <p className="text-sm text-muted-foreground">
            {order.paymentProvider
              ? `You chose ${order.paymentProvider === "RAZORPAY" ? "UPI / Cards (Razorpay)" : "Crypto (CoinGate)"}. `
              : ""}
            Secure payment goes live in the next update — your order is reserved
            until then.
          </p>
          <button
            type="button"
            disabled
            className="mt-1 inline-flex w-fit cursor-not-allowed items-center gap-2 rounded-sm bg-muted px-5 py-2.5 font-heading text-sm font-bold text-muted-foreground"
          >
            Pay now (coming soon)
          </button>
        </div>
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
