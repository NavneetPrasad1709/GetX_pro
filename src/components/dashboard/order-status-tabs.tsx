import Link from "next/link";
import { cn } from "@/lib/utils";

export type OrderFilter =
  | "all"
  | "needs_action"
  | "active"
  | "completed"
  | "disputed";

export const ORDER_FILTERS: { key: OrderFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "needs_action", label: "Needs action" },
  { key: "active", label: "Active" },
  { key: "completed", label: "Completed" },
  { key: "disputed", label: "Disputed" },
];

/** Coerce a raw ?filter= value to a valid OrderFilter (default "all"). */
export function parseOrderFilter(raw: string | string[] | undefined): OrderFilter {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return ORDER_FILTERS.some((f) => f.key === v) ? (v as OrderFilter) : "all";
}

/**
 * Order status tabs (Prompt 06) — pill links that drive the `?filter=` query.
 * Pure Server Component (zero client JS): each tab is a <Link>, the page re-renders
 * server-side on filter change. The "Needs action" tab is hidden when its count is 0.
 */
export function OrderStatusTabs({
  counts,
  current,
}: {
  counts: Record<OrderFilter, number>;
  current: OrderFilter;
}) {
  return (
    <div
      className="flex gap-1 overflow-x-auto pb-1"
      role="tablist"
      aria-label="Filter orders by status"
    >
      {ORDER_FILTERS.map((f) => {
        if (f.key === "needs_action" && counts.needs_action === 0) return null;
        const active = f.key === current;
        return (
          <Link
            key={f.key}
            href={`?filter=${f.key}`}
            role="tab"
            aria-selected={active}
            className={cn(
              "rounded-full px-3 py-1 font-heading text-sm font-semibold whitespace-nowrap transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
              active
                ? "bg-secondary text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {f.label} ({counts[f.key]})
          </Link>
        );
      })}
    </div>
  );
}
