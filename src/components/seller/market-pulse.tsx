import { TrendingUpIcon } from "lucide-react";
import type { CategoryKind } from "@prisma/client";
import { db } from "@/lib/db";
import { getDemandForecast, type DemandLevel } from "@/server/services/demand-forecast";
import { LISTING_TYPE_LABEL } from "@/config/games";
import { cn } from "@/lib/utils";

const LEVEL_TONE: Record<DemandLevel, string> = {
  HIGH: "bg-success/15 text-success",
  MEDIUM: "bg-warning/15 text-warning",
  LOW: "bg-destructive/15 text-destructive",
};

/**
 * "Market Pulse" (Step 26) — a demand-forecast pill per game+category the seller actively lists in.
 * AI-backed (Claude Haiku) with graceful fallbacks: low data → MEDIUM "not enough data"; no AI key
 * or AI error → neutral "Forecast unavailable" pill. Server component; one forecast per pair.
 */
export async function MarketPulse({ sellerId }: { sellerId: string }) {
  const pairs = await db.listing.findMany({
    where: { sellerId, status: "ACTIVE" },
    select: { gameId: true, type: true, game: { select: { name: true } } },
    distinct: ["gameId", "type"],
    take: 8,
  });
  if (pairs.length === 0) return null;

  const forecasts = await Promise.all(
    pairs.map(async (p) => ({
      gameName: p.game.name,
      kind: p.type as CategoryKind,
      forecast: await getDemandForecast(p.gameId, p.type),
    })),
  );

  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <h2 className="mb-1 flex items-center gap-2 font-heading text-sm font-semibold">
        <TrendingUpIcon className="size-4 text-primary" aria-hidden="true" />
        Market Pulse
      </h2>
      <p className="mb-3 text-xs text-muted-foreground">
        AI demand read for the games you sell in — updated daily.
      </p>
      <div className="flex flex-col gap-2">
        {forecasts.map((f, i) => (
          <div
            key={`${f.gameName}-${f.kind}-${i}`}
            className="flex flex-wrap items-center gap-2 border-t border-border pt-2 first:border-t-0 first:pt-0"
          >
            <span className="text-sm font-medium">
              {f.gameName}{" "}
              <span className="text-muted-foreground">· {LISTING_TYPE_LABEL[f.kind]}</span>
            </span>
            {f.forecast ? (
              <>
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-[11px] font-bold",
                    LEVEL_TONE[f.forecast.level],
                  )}
                >
                  {f.forecast.level} demand
                </span>
                <span className="w-full text-xs text-muted-foreground sm:w-auto sm:flex-1">
                  {f.forecast.reasoning}
                </span>
              </>
            ) : (
              <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
                Forecast unavailable
              </span>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
