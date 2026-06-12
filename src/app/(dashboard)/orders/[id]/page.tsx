import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowRightIcon,
  CheckCircle2Icon,
  KeyRoundIcon,
  ShieldAlertIcon,
} from "lucide-react";
import type { OrderStatus } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { getOrder } from "@/server/services/orders";
import { getDeliveryContentForOrder } from "@/server/services/delivery";
import { getOrderReviewContext, orderHasReview } from "@/server/services/reviews";
import { formatMoney } from "@/lib/money";
import { Breadcrumbs } from "@/components/shared/breadcrumbs";
import { OrderStatusBadge } from "@/components/orders/order-status-badge";
import { EscrowStepper } from "@/components/orders/escrow-stepper";
import { PayNow } from "@/components/orders/pay-now";
import { PaymentStatusPoller } from "@/components/orders/payment-status-poller";
import { DeliverForm } from "@/components/orders/deliver-form";
import { ConfirmReceipt } from "@/components/orders/confirm-receipt";
import { ReviewForm } from "@/components/reviews/review-form";
import { AskForReview } from "@/components/orders/ask-for-review";
import { ChatWithSellerButton } from "@/components/chat/chat-with-seller-button";
import { DeliveryContentCard } from "@/components/orders/delivery-content-card";

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

const dateFmt = new Intl.DateTimeFormat("en-US", {
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
  const isSeller = order.seller.userId === session.user.id;
  // Step 19: auto-delivered item (decrypted server-side for the buyer/seller/admin only).
  const deliveryContent = ["PAID", "DELIVERED", "COMPLETED"].includes(order.status)
    ? await getDeliveryContentForOrder(order.id, session.user.id, session.user.role === "ADMIN")
    : null;
  // What the seller nets after their category commission (seller-only view).
  const sellerPayoutMinor = subtotalMinor - order.sellerFeeMinor;
  const deadlineLabel = order.autoReleaseAt
    ? dateFmt.format(order.autoReleaseAt)
    : null;
  // Review box only matters once the buyer's order is COMPLETED.
  const reviewCtx =
    order.status === "COMPLETED" && isBuyer
      ? await getOrderReviewContext(session.user.id, order.id)
      : null;
  // Seller-side: nudge to ask the buyer for a review once the sale completes
  // and no review exists yet (Prompt 14).
  const sellerCanAskReview =
    order.status === "COMPLETED" && isSeller
      ? !(await orderHasReview(order.id))
      : false;
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

      {/* visual escrow lifecycle (Prompt 13) — read-only; actions stay below */}
      <EscrowStepper
        status={order.status}
        viewer={isBuyer ? "buyer" : "seller"}
        deadlineLabel={deadlineLabel ?? undefined}
        formattedTotal={formatMoney(order.totalMinor, order.currency)}
      />

      {/* what happens next — plain-text complement to the stepper (a11y / scan) */}
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
        <ChatWithSellerButton
          orderId={order.id}
          label={isSeller ? "Chat with buyer" : "Chat with seller"}
          className="mt-3"
        />
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
        {/* seller-only: what you net after your category commission */}
        {isSeller ? (
          <div className="mt-1 flex items-center justify-between border-t border-dashed border-border pt-2.5">
            <dt className="text-muted-foreground">Your payout after fees</dt>
            <dd className="font-semibold tabular-nums text-success">
              {formatMoney(sellerPayoutMinor, order.currency)}
            </dd>
          </div>
        ) : null}
      </dl>

      {/* delivered goods — visible to buyer + seller only (getOrder-gated) */}
      {order.delivery ? (
        <div className="flex flex-col gap-2 rounded-lg border border-border bg-card p-4">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <KeyRoundIcon className="size-4 text-primary" aria-hidden="true" />
            Delivery details
          </div>
          <p className="text-xs text-muted-foreground">
            {isSeller
              ? "What you sent the buyer."
              : "Sent by the seller — keep it somewhere safe."}
          </p>
          <pre className="overflow-x-auto rounded-md border border-border bg-background p-3 font-mono text-xs break-words whitespace-pre-wrap text-foreground">
            {order.delivery.content}
          </pre>
        </div>
      ) : null}

      {/* Step 19: auto-delivered item (decrypt-on-read, buyer/seller/admin only) */}
      {deliveryContent ? <DeliveryContentCard content={deliveryContent} /> : null}

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

      {/* seller: deliver a paid order */}
      {order.status === "PAID" && isSeller ? (
        <DeliverForm orderId={order.id} />
      ) : null}

      {/* buyer: confirm receipt or open a dispute on a delivered order */}
      {order.status === "DELIVERED" && isBuyer && order.autoReleaseAt ? (
        <ConfirmReceipt
          orderId={order.id}
          autoReleaseAtMs={order.autoReleaseAt.getTime()}
          deadlineLabel={dateFmt.format(order.autoReleaseAt)}
        />
      ) : null}

      {/* seller: delivered, waiting on the buyer */}
      {order.status === "DELIVERED" && isSeller ? (
        <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 text-sm">
          <p className="font-semibold">
            Delivered — waiting for the buyer to confirm.
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Payment auto-releases to your wallet on {deadlineLabel}, or sooner if
            the buyer confirms.
          </p>
        </div>
      ) : null}

      {/* dispute open (both parties) */}
      {order.status === "DISPUTED" && order.dispute ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm">
          <div className="flex items-center gap-2 font-semibold text-destructive">
            <ShieldAlertIcon className="size-4" aria-hidden="true" />
            Dispute under review
          </div>
          <p className="mt-1.5 text-xs text-muted-foreground">
            Reason:{" "}
            <span className="text-foreground">{order.dispute.reason}</span>
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Our team will review and resolve this fairly. The payment is frozen
            until then.
          </p>
        </div>
      ) : null}

      {/* completed: seller payout confirmation */}
      {order.status === "COMPLETED" && isSeller ? (
        <div className="flex items-center gap-2 rounded-lg border border-success/30 bg-success/5 p-4 text-sm">
          <CheckCircle2Icon
            className="size-4 shrink-0 text-success"
            aria-hidden="true"
          />
          <span>
            Payment released —{" "}
            <span className="font-semibold">
              {formatMoney(sellerPayoutMinor, order.currency)}
            </span>{" "}
            added to your wallet balance.
          </span>
        </div>
      ) : null}

      {/* completed: buyer leaves / edits a review */}
      {reviewCtx && (reviewCtx.canReview || reviewCtx.existing) ? (
        <ReviewForm
          orderId={order.id}
          reviewId={reviewCtx.existing?.id}
          initialRating={reviewCtx.existing?.rating ?? 0}
          initialComment={reviewCtx.existing?.comment}
        />
      ) : null}

      {/* completed: seller nudge to ask the buyer for a review */}
      {sellerCanAskReview ? <AskForReview /> : null}

      <Link
        href="/orders"
        className="text-sm font-semibold text-primary hover:text-primary-hover"
      >
        ← All orders
      </Link>
    </div>
  );
}
