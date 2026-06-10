import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { getDisputeContext } from "@/server/services/admin";
import { formatMoney } from "@/lib/money";
import { Breadcrumbs } from "@/components/shared/breadcrumbs";
import { DisputeResolveActions } from "@/components/admin/dispute-resolve-actions";

export const metadata: Metadata = { title: "Dispute — Admin", robots: { index: false } };

type Props = { params: Promise<{ id: string }> };

const timeFmt = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" });

const STATUS_LABEL: Record<string, string> = {
  OPEN: "Open",
  RESOLVED_BUYER: "Resolved — refunded buyer",
  RESOLVED_SELLER: "Resolved — released to seller",
  CLOSED: "Closed",
};

export default async function AdminDisputeDetailPage({ params }: Props) {
  await requireRole("ADMIN");
  const { id } = await params;
  const ctx = await getDisputeContext(id);
  if (!ctx) notFound();

  const resolved = ctx.disputeStatus !== "OPEN";

  return (
    <div className="flex flex-col gap-5">
      <Breadcrumbs
        items={[
          { label: "Admin", href: "/admin" },
          { label: "Disputes", href: "/admin/disputes" },
          { label: "Dispute" },
        ]}
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dispute</h1>
          <p className="mt-0.5 text-xs text-faint">
            {ctx.listingTitle} · {ctx.buyerName} (buyer) vs {ctx.sellerName} (seller)
          </p>
        </div>
        <Link
          href={`/orders/${ctx.orderId}`}
          className="text-sm font-semibold text-primary hover:text-primary-hover"
        >
          View order →
        </Link>
      </div>

      {/* summary */}
      <dl className="grid grid-cols-2 gap-3 rounded-lg border border-border bg-card p-4 text-sm min-[521px]:grid-cols-4">
        <div>
          <dt className="text-xs text-faint">Amount in escrow</dt>
          <dd className="font-semibold tabular-nums">
            {formatMoney(ctx.totalMinor, ctx.currency)}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-faint">Order status</dt>
          <dd className="font-semibold">{ctx.orderStatus}</dd>
        </div>
        <div className="col-span-2">
          <dt className="text-xs text-faint">Dispute</dt>
          <dd className="font-semibold">{STATUS_LABEL[ctx.disputeStatus] ?? ctx.disputeStatus}</dd>
        </div>
      </dl>

      {/* reason */}
      <section className="rounded-lg border border-destructive/30 bg-destructive/5 p-4">
        <h2 className="text-sm font-semibold text-destructive">Buyer&apos;s reason</h2>
        <p className="mt-1.5 text-sm break-words whitespace-pre-line text-muted-foreground">
          {ctx.reason}
        </p>
      </section>

      {/* delivery proof */}
      {ctx.deliveryContent ? (
        <section className="rounded-lg border border-border bg-card p-4">
          <h2 className="text-sm font-semibold">Delivery proof (what the seller sent)</h2>
          <pre className="mt-2 overflow-x-auto rounded-md border border-border bg-background p-3 font-mono text-xs break-words whitespace-pre-wrap text-foreground">
            {ctx.deliveryContent}
          </pre>
        </section>
      ) : null}

      {/* chat */}
      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold">Conversation</h2>
        {ctx.messages.length === 0 ? (
          <p className="rounded-lg border border-border bg-card/40 p-3 text-xs text-muted-foreground">
            No chat between the buyer and seller.
          </p>
        ) : (
          <ul className="flex flex-col gap-2 rounded-lg border border-border bg-card p-3">
            {ctx.messages.map((m, i) => (
              <li key={i} className="text-sm">
                <span className="font-semibold">{m.senderName}</span>{" "}
                <span className="text-xs text-faint">{timeFmt.format(new Date(m.createdAt))}</span>
                <p className="break-words whitespace-pre-line text-muted-foreground">{m.body}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* resolution */}
      {resolved ? (
        <div className="rounded-lg border border-success/30 bg-success/5 p-4 text-sm">
          <p className="font-semibold">
            {STATUS_LABEL[ctx.disputeStatus] ?? "Resolved"}
          </p>
          {ctx.resolutionNote ? (
            <p className="mt-1 text-xs text-muted-foreground">
              Note: {ctx.resolutionNote}
            </p>
          ) : null}
        </div>
      ) : (
        <section className="rounded-lg border border-border bg-card p-4">
          <h2 className="mb-2 text-sm font-semibold">Resolve</h2>
          <DisputeResolveActions orderId={ctx.orderId} />
        </section>
      )}
    </div>
  );
}
