"use client";

import { useState, useTransition } from "react";
import { ArrowDownLeftIcon, ArrowUpRightIcon } from "lucide-react";
import { loadLedgerAction } from "@/server/actions/payouts";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";
import type { LedgerHistoryItem } from "@/server/services/payouts";

/**
 * Wallet ledger feed (Step 14) — every credit/debit with a human reason, with
 * All / Money-in / Money-out filters and cursor pagination. Read-only; the
 * ledger is append-only truth.
 */

const REASON_LABEL: Record<string, string> = {
  SALE: "Sale",
  FEE: "Platform fee",
  REFUND: "Refund",
  PAYOUT: "Withdrawal",
  ESCROW_HOLD: "Escrow hold",
  ESCROW_RELEASE: "Escrow release",
};

const dateFmt = new Intl.DateTimeFormat("en-IN", {
  dateStyle: "medium",
  timeStyle: "short",
});

type Filter = "all" | "credits" | "debits";
const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "credits", label: "Money in" },
  { key: "debits", label: "Money out" },
];

export function LedgerHistory({
  currency,
  initial,
  initialCursor,
}: {
  currency: string;
  initial: LedgerHistoryItem[];
  initialCursor: string | null;
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const [items, setItems] = useState(initial);
  const [cursor, setCursor] = useState(initialCursor);
  const [isPending, startTransition] = useTransition();

  function applyFilter(next: Filter) {
    if (next === filter) return;
    setFilter(next);
    startTransition(async () => {
      const res = await loadLedgerAction(next, undefined);
      if (res.ok) {
        setItems(res.items);
        setCursor(res.nextCursor);
      }
    });
  }

  function loadMore() {
    if (!cursor) return;
    startTransition(async () => {
      const res = await loadLedgerAction(filter, cursor);
      if (res.ok) {
        setItems((prev) => [...prev, ...res.items]);
        setCursor(res.nextCursor);
      }
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div role="tablist" aria-label="Filter transactions" className="flex gap-1.5">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            role="tab"
            aria-selected={filter === f.key}
            disabled={isPending}
            onClick={() => applyFilter(f.key)}
            className={cn(
              "rounded-full px-3 py-1 text-xs font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none disabled:opacity-60",
              filter === f.key
                ? "bg-secondary text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {items.length === 0 ? (
        <p className="rounded-lg border border-border bg-card/40 p-4 text-sm text-muted-foreground">
          No transactions yet — your sales and withdrawals will show up here.
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-border rounded-lg border border-border bg-card">
          {items.map((e) => {
            const credit = e.type === "CREDIT";
            return (
              <li key={e.id} className="flex items-center gap-3 p-3">
                <span
                  className={cn(
                    "grid size-8 shrink-0 place-items-center rounded-full",
                    credit
                      ? "bg-success/12 text-success"
                      : "bg-muted text-muted-foreground",
                  )}
                >
                  {credit ? (
                    <ArrowDownLeftIcon className="size-4" aria-hidden="true" />
                  ) : (
                    <ArrowUpRightIcon className="size-4" aria-hidden="true" />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">
                    {REASON_LABEL[e.reason] ?? e.reason}
                  </p>
                  <p className="text-xs text-faint">
                    {dateFmt.format(new Date(e.createdAt))}
                  </p>
                </div>
                <span
                  className={cn(
                    "shrink-0 text-sm font-semibold tabular-nums",
                    credit ? "text-success" : "text-foreground",
                  )}
                >
                  {credit ? "+" : "−"}
                  {formatMoney(e.amountMinor, currency)}
                </span>
              </li>
            );
          })}
        </ul>
      )}

      {cursor ? (
        <Button
          type="button"
          variant="outline"
          onClick={loadMore}
          disabled={isPending}
          className="self-center"
        >
          {isPending ? "Loading…" : "Load more"}
        </Button>
      ) : null}
    </div>
  );
}
