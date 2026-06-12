import Link from "next/link";
import type { LoyaltyPoint, LoyaltyPointReason } from "@prisma/client";
import { cn } from "@/lib/utils";

const REASON_LABEL: Record<LoyaltyPointReason, string> = {
  SIGNUP_BONUS: "Welcome bonus",
  PURCHASE: "Purchase reward",
  SALE: "Sale reward",
  REDEMPTION: "Redeemed at checkout",
  PURCHASE_REFUND: "Refund — points returned",
};

const dateFmt = new Intl.DateTimeFormat("en-US", { dateStyle: "medium" });

/** Read-only loyalty transaction history (Step 21). EARN rows are +, REDEEM rows are −. */
export function LoyaltyHistory({ rows }: { rows: LoyaltyPoint[] }) {
  if (rows.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">
        No points activity yet — earn on every completed order.
      </p>
    );
  }
  return (
    <ul className="flex flex-col divide-y divide-border">
      {rows.map((r) => {
        const isEarn = r.type === "EARN";
        return (
          <li key={r.id} className="flex items-center gap-3 py-2.5">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{REASON_LABEL[r.reason]}</p>
              <p className="text-xs text-muted-foreground">
                {dateFmt.format(r.createdAt)}
                {r.orderId ? (
                  <>
                    {" · "}
                    <Link href={`/orders/${r.orderId}`} className="hover:text-primary">
                      order
                    </Link>
                  </>
                ) : null}
              </p>
            </div>
            <span
              className={cn(
                "shrink-0 font-heading text-sm font-bold tabular-nums",
                isEarn ? "text-success" : "text-muted-foreground",
              )}
            >
              {isEarn ? "+" : "−"}
              {r.amount} pts
            </span>
          </li>
        );
      })}
    </ul>
  );
}
