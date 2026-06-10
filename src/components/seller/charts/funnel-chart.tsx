"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from "recharts";
import type { FunnelStage } from "@/server/services/seller-analytics";

const GRID = "#262a33";
const AXIS = "#9aa4b2";

// Per-status bar colour + short label.
const META: Record<string, { label: string; color: string }> = {
  AWAITING_PAYMENT: { label: "Awaiting", color: "#9aa4b2" },
  PAID: { label: "Paid", color: "#4d7cfe" },
  DELIVERED: { label: "Delivered", color: "#22d3ee" },
  COMPLETED: { label: "Completed", color: "#45b483" },
  DISPUTED: { label: "Disputed", color: "#e0a800" },
  REFUNDED: { label: "Refunded", color: "#fb923c" },
  CANCELLED: { label: "Cancelled", color: "#ef4759" },
};

type Row = { status: string; label: string; color: string; count: number };

function FunnelTooltip({ active, payload }: TooltipContentProps) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload as Row | undefined;
  if (!row) return null;
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 text-xs shadow-lg">
      <p className="font-semibold">{row.label}</p>
      <p className="mt-1 text-muted-foreground">
        {row.count} order{row.count === 1 ? "" : "s"}
      </p>
    </div>
  );
}

/** Order funnel bar chart (Step 20). Only stages with count > 0 are shown to cut noise. */
export function FunnelChart({ data }: { data: FunnelStage[] }) {
  const chart: Row[] = data
    .filter((s) => s.count > 0)
    .map((s) => ({
      status: s.status,
      label: META[s.status]?.label ?? s.status,
      color: META[s.status]?.color ?? "#9aa4b2",
      count: s.count,
    }));

  if (chart.length === 0) {
    return (
      <p className="py-12 text-center text-sm text-muted-foreground">
        No orders in this period yet.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[340px]">
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={chart} margin={{ top: 8, right: 14, bottom: 0, left: -10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 11, fill: AXIS }}
              tickLine={false}
              axisLine={{ stroke: GRID }}
            />
            <YAxis
              allowDecimals={false}
              tick={{ fontSize: 11, fill: AXIS }}
              tickLine={false}
              axisLine={false}
              width={32}
            />
            <Tooltip content={FunnelTooltip} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
            <Bar dataKey="count" radius={[4, 4, 0, 0]}>
              {chart.map((row) => (
                <Cell key={row.status} fill={row.color} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
