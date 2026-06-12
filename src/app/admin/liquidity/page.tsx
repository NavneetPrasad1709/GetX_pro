import type { Metadata } from "next";
import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { getLiquidityStats } from "@/server/services/liquidity";
import { LISTING_TYPE_LABEL } from "@/config/games";

export const metadata: Metadata = { title: "Liquidity — Admin" };

// Ops counts tolerate 60s staleness — avoids a full-table scan on every load.
export const revalidate = 60;

/** Supply-health tone: green ≥5 active · amber 1-4 · red 0 (mirrors Eldorado ops). */
function supplyTone(active: number): { dot: string; row: string } {
  if (active >= 5) return { dot: "bg-success", row: "" };
  if (active >= 1) return { dot: "bg-warning", row: "" };
  return { dot: "bg-destructive", row: "bg-destructive/5" };
}

export default async function AdminLiquidityPage() {
  await requireRole("ADMIN");
  const stats = await getLiquidityStats();

  const totalActive = stats.reduce((s, r) => s + r.activeListings, 0);
  const totalDemand = stats.reduce((s, r) => s + r.demandSignals, 0);
  const emptyCount = stats.filter((r) => r.activeListings === 0).length;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Liquidity</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Supply depth and captured demand per category. Recruit sellers into the
          red rows — high demand with zero supply is where buyers are bouncing.
        </p>
      </div>

      {/* summary tiles */}
      <div className="grid grid-cols-2 gap-3 min-[761px]:grid-cols-4">
        <SummaryTile label="Categories" value={stats.length} />
        <SummaryTile label="Active listings" value={totalActive} />
        <SummaryTile label="Demand signals" value={totalDemand} />
        <SummaryTile
          label="Empty categories"
          value={emptyCount}
          tone={emptyCount > 0 ? "text-destructive" : "text-success"}
        />
      </div>

      {/* table */}
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full min-w-[760px] text-sm">
          <thead>
            <tr className="border-b border-border bg-card/60 text-left text-xs uppercase tracking-wide text-faint">
              <th className="px-3 py-2.5 font-medium">Game</th>
              <th className="px-3 py-2.5 font-medium">Category</th>
              <th className="px-3 py-2.5 font-medium">Kind</th>
              <th className="px-3 py-2.5 text-right font-medium">Active</th>
              <th className="px-3 py-2.5 text-right font-medium">Sellers</th>
              <th className="px-3 py-2.5 text-right font-medium">Demand</th>
              <th className="px-3 py-2.5 text-right font-medium">Stale</th>
              <th className="px-3 py-2.5 font-medium">Fill rate</th>
              <th className="px-3 py-2.5 font-medium">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {stats.map((r) => {
              const tone = supplyTone(r.activeListings);
              return (
                <tr
                  key={`${r.gameSlug}/${r.categorySlug}`}
                  className={`border-b border-border last:border-0 ${tone.row}`}
                >
                  <td className="px-3 py-2.5">
                    <span className="flex items-center gap-2">
                      <span
                        className={`size-2 shrink-0 rounded-full ${tone.dot}`}
                        aria-hidden="true"
                      />
                      {r.gameName}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">{r.categoryName}</td>
                  <td className="px-3 py-2.5 text-muted-foreground">
                    {LISTING_TYPE_LABEL[r.kind]}
                  </td>
                  <td className="px-3 py-2.5 text-right font-semibold tabular-nums">
                    {r.activeListings}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">
                    {r.totalSellers}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">
                    {r.demandSignals}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">
                    {r.staleListings}
                  </td>
                  <td className="px-3 py-2.5">
                    <span className="flex items-center gap-2">
                      <span
                        className="h-1.5 w-16 overflow-hidden rounded-full bg-muted"
                        aria-hidden="true"
                      >
                        <span
                          className="block h-full rounded-full bg-primary"
                          style={{ width: `${Math.round(r.fillRate * 100)}%` }}
                        />
                      </span>
                      <span className="text-xs tabular-nums text-faint">
                        {Math.round(r.fillRate * 100)}%
                      </span>
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    <Link
                      href={`/games/${r.gameSlug}/${r.categorySlug}`}
                      className="text-xs font-semibold text-primary hover:text-primary-hover focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                    >
                      View →
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SummaryTile({
  label,
  value,
  tone = "text-foreground",
}: {
  label: string;
  value: number;
  tone?: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`mt-1 font-heading text-2xl font-bold tabular-nums ${tone}`}>
        {value.toLocaleString("en-US")}
      </p>
    </div>
  );
}
