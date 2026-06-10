"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from "recharts";
import type { RevenuePoint } from "@/server/services/seller-analytics";

// Literal theme colours — SVG presentation attributes don't resolve CSS vars.
const BLUE = "#4d7cfe";
const GRID = "#262a33";
const AXIS = "#9aa4b2";

function shortDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

type Row = RevenuePoint & { label: string; rupees: number };

function RevenueTooltip({ active, payload }: TooltipContentProps) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload as Row | undefined;
  if (!row) return null;
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 text-xs shadow-lg">
      <p className="font-semibold">{row.label}</p>
      <p className="mt-1 text-primary">
        ₹{row.rupees.toLocaleString("en-IN")} revenue
      </p>
      <p className="text-muted-foreground">
        {row.orders} sale{row.orders === 1 ? "" : "s"}
      </p>
    </div>
  );
}

/** Daily revenue line chart (Step 20). Data is gap-filled server-side; minor units → ₹ here. */
export function RevenueChart({ data }: { data: RevenuePoint[] }) {
  const chart: Row[] = data.map((p) => ({
    ...p,
    label: shortDate(p.date),
    rupees: Math.round(p.revenue / 100),
  }));

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[340px]">
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={chart} margin={{ top: 8, right: 14, bottom: 0, left: -10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 11, fill: AXIS }}
              tickLine={false}
              axisLine={{ stroke: GRID }}
              minTickGap={24}
            />
            <YAxis
              tick={{ fontSize: 11, fill: AXIS }}
              tickLine={false}
              axisLine={false}
              width={56}
              tickFormatter={(v: number) => `₹${v.toLocaleString("en-IN")}`}
            />
            <Tooltip content={RevenueTooltip} cursor={{ stroke: GRID }} />
            <Line
              type="monotone"
              dataKey="rupees"
              stroke={BLUE}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, fill: BLUE }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
