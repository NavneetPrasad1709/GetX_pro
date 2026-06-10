"use client";

import { useMemo } from "react";
import type { RevenueDay } from "@/server/services/founder-analytics";
import { formatMoney } from "@/lib/money";

/**
 * GMV + Platform-revenue trend (Step 19). No charting dependency — a pure
 * CSS/Tailwind bar chart (Recharts isn't installed). Each day is a column: the
 * tall translucent bar is GMV, the solid bar inside it is platform revenue
 * (always ≤ GMV since take-rate < 100%). Receives data as a prop — never fetches.
 */
export function GmvRevenueChart({ data }: { data: RevenueDay[] }) {
  const maxGmv = useMemo(
    () => Math.max(1, ...data.map((d) => d.gmvMinor)),
    [data],
  );

  if (data.length === 0 || maxGmv <= 1) {
    return (
      <div className="grid h-[240px] place-items-center text-sm text-muted-foreground">
        No orders yet — check back once your first sale completes.
      </div>
    );
  }

  const totalGmv = data.reduce((s, d) => s + d.gmvMinor, 0);
  const totalRev = data.reduce((s, d) => s + d.revenueMinor, 0);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-4 text-xs">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block size-2.5 rounded-sm bg-primary/30" /> GMV
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block size-2.5 rounded-sm bg-primary" /> Platform revenue
        </span>
      </div>

      <div className="overflow-x-auto">
        <div
          className="flex h-[240px] min-w-[360px] items-end gap-px"
          role="img"
          aria-label={`GMV and revenue trend over ${data.length} days`}
        >
          {data.map((d) => {
            const gmvH = Math.round((d.gmvMinor / maxGmv) * 100);
            const revH = Math.round((d.revenueMinor / maxGmv) * 100);
            const take =
              d.gmvMinor > 0
                ? ((d.revenueMinor / d.gmvMinor) * 100).toFixed(1)
                : "0.0";
            return (
              <div
                key={d.date}
                className="relative flex h-full flex-1 items-end"
                title={`${d.date}\nGMV: ${formatMoney(d.gmvMinor)}\nRevenue: ${formatMoney(d.revenueMinor)}\nTake-rate: ${take}%\nOrders: ${d.orderCount}`}
              >
                <div
                  className="w-full rounded-t-sm bg-primary/25"
                  style={{ height: `${Math.max(gmvH, d.gmvMinor > 0 ? 2 : 0)}%` }}
                >
                  <div
                    className="absolute bottom-0 w-full rounded-t-sm bg-primary"
                    style={{ height: `${Math.max(revH, d.revenueMinor > 0 ? 2 : 0)}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
        <span>{data[0]?.date}</span>
        <span>
          Σ GMV {formatMoney(totalGmv)} · Σ Revenue {formatMoney(totalRev)}
        </span>
        <span>{data[data.length - 1]?.date}</span>
      </div>
    </div>
  );
}
