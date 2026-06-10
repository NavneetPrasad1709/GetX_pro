import { z } from "zod";
import { captureException } from "@sentry/nextjs";
import type { CategoryKind, MarketSignal } from "@prisma/client";
import { db } from "@/lib/db";
import { generateJSON, AI_MODELS, isAiEnabled } from "@/lib/ai";

/**
 * Demand forecast + pricing assistant (Step 26). A daily cron aggregates completed orders + searches
 * into `MarketSignal` rows; Claude Haiku turns the last 30 days into a HIGH/MEDIUM/LOW demand read
 * and a raise/lower/keep price suggestion. All AI is graceful — no `ANTHROPIC_API_KEY` ⇒ null /
 * low-data fallback, never a crash. AI suggests; the seller decides (nothing is auto-applied).
 */

const DAY_MS = 86_400_000;

/** Start-of-day UTC for `d` (defaults to today). */
function utcMidnight(d = new Date()): Date {
  return new Date(Math.floor(d.getTime() / DAY_MS) * DAY_MS);
}

// ---------------------------------------------------------------------------
// Cron aggregation (callable directly so QA drives it without HTTP).
// ---------------------------------------------------------------------------

/**
 * Aggregate one calendar day's COMPLETED orders into MarketSignal rows, grouped by
 * (game, category-kind). Idempotent via the @@unique upsert. `forDate` defaults to yesterday.
 * Returns the number of signal rows upserted.
 */
export async function aggregateMarketSignals(forDate?: Date): Promise<number> {
  const day = forDate ? utcMidnight(forDate) : new Date(utcMidnight().getTime() - DAY_MS);
  const next = new Date(day.getTime() + DAY_MS);

  // Group completed orders by (gameId, listing kind). Listing.type IS the CategoryKind.
  const groups = await db.$queryRaw<
    { gameId: string; kind: CategoryKind; cnt: bigint; avgprice: number | null }[]
  >`
    SELECT l."gameId" AS "gameId",
           l."type"   AS kind,
           COUNT(*)   AS cnt,
           ROUND(AVG(o."unitPriceMinor" * o."qty")) AS avgprice
    FROM "Order" o
    JOIN "Listing" l ON l.id = o."listingId"
    WHERE o."status" = 'COMPLETED'
      AND o."updatedAt" >= ${day}
      AND o."updatedAt" < ${next}
    GROUP BY l."gameId", l."type"
  `;

  // Search volume yesterday, by game slug → resolve to game ids for the searchCount column.
  const games = await db.game.findMany({ select: { id: true, slug: true } });
  const idBySlug = new Map(games.map((g) => [g.slug, g.id]));
  const searchRows = await db.searchLog.groupBy({
    by: ["gameId"],
    where: { createdAt: { gte: day, lt: next }, gameId: { not: null } },
    _count: { _all: true },
  });
  const searchByGameId = new Map<string, number>();
  for (const r of searchRows) {
    const gid = r.gameId ? idBySlug.get(r.gameId) : undefined;
    if (gid) searchByGameId.set(gid, (searchByGameId.get(gid) ?? 0) + r._count._all);
  }

  let upserted = 0;
  for (const g of groups) {
    await db.marketSignal.upsert({
      where: { gameId_categoryKind_date: { gameId: g.gameId, categoryKind: g.kind, date: day } },
      create: {
        gameId: g.gameId,
        categoryKind: g.kind,
        date: day,
        orderCount: Number(g.cnt),
        avgPriceMinor: Number(g.avgprice ?? 0),
        searchCount: searchByGameId.get(g.gameId) ?? 0,
      },
      update: {
        orderCount: Number(g.cnt),
        avgPriceMinor: Number(g.avgprice ?? 0),
        searchCount: searchByGameId.get(g.gameId) ?? 0,
      },
    });
    upserted += 1;
  }
  return upserted;
}

// ---------------------------------------------------------------------------
// Reads + AI.
// ---------------------------------------------------------------------------

export async function getMarketTrends(gameId: string, days = 30): Promise<MarketSignal[]> {
  const since = new Date(utcMidnight().getTime() - days * DAY_MS);
  return db.marketSignal.findMany({
    where: { gameId, date: { gte: since } },
    orderBy: { date: "asc" },
  });
}

export type DemandLevel = "HIGH" | "MEDIUM" | "LOW";
export type DemandForecastResult = {
  level: DemandLevel;
  reasoning: string;
  sevenDayOutlook: string;
  dataPoints: number;
};

const ForecastAiSchema = z.object({
  level: z.enum(["HIGH", "MEDIUM", "LOW"]),
  reasoning: z.string().min(1).max(300),
  sevenDayOutlook: z.string().min(1).max(300),
});

// Simple in-memory TTL cache so page loads don't hammer the AI.
type Cached<T> = { value: T; expiresAt: number };
const forecastCache = new Map<string, Cached<DemandForecastResult>>();
const pricingCache = new Map<string, Cached<PricingRecommendation>>();
const TTL_MS = 60 * 60 * 1000;

function cacheGet<T>(map: Map<string, Cached<T>>, key: string): T | undefined {
  const hit = map.get(key);
  if (hit && hit.expiresAt > Date.now()) return hit.value;
  if (hit) map.delete(key);
  return undefined;
}

export async function getDemandForecast(
  gameId: string,
  categoryKind: CategoryKind,
): Promise<DemandForecastResult | null> {
  const key = `${gameId}:${categoryKind}`;
  const cached = cacheGet(forecastCache, key);
  if (cached) return cached;

  const since = new Date(utcMidnight().getTime() - 30 * DAY_MS);
  const signals = await db.marketSignal.findMany({
    where: { gameId, categoryKind, date: { gte: since } },
    orderBy: { date: "asc" },
    select: { date: true, orderCount: true, avgPriceMinor: true, searchCount: true },
  });

  if (signals.length < 3) {
    return {
      level: "MEDIUM",
      reasoning: "Insufficient data for a confident forecast.",
      sevenDayOutlook: "Not enough historical data yet.",
      dataPoints: signals.length,
    };
  }
  if (!isAiEnabled()) return null;

  const ai = await generateJSON({
    schema: ForecastAiSchema,
    model: AI_MODELS.fast,
    maxTokens: 300,
    system:
      "You are a demand analyst for a gaming marketplace. From the daily signals, judge buyer demand for the next 7 days. Reply with ONLY a JSON object {level, reasoning, sevenDayOutlook}. level is HIGH, MEDIUM or LOW. reasoning + sevenDayOutlook are one short sentence each, no emojis.",
    prompt: `Daily signals (oldest first) for this game+category:\n${JSON.stringify(
      signals.map((s) => ({
        date: s.date.toISOString().slice(0, 10),
        orders: s.orderCount,
        avgPriceMinor: s.avgPriceMinor,
        searches: s.searchCount,
      })),
    )}`,
  });

  if (!ai) return null;
  const result: DemandForecastResult = { ...ai, dataPoints: signals.length };
  forecastCache.set(key, { value: result, expiresAt: Date.now() + TTL_MS });
  return result;
}

export type PriceAction = "RAISE" | "LOWER" | "KEEP";
export type PricingRecommendation = {
  action: PriceAction;
  suggestedPriceMinor: number;
  reason: string;
  confidenceLabel: "HIGH" | "MEDIUM" | "LOW";
};

const PricingAiSchema = z.object({
  action: z.enum(["RAISE", "LOWER", "KEEP"]),
  suggestedPriceMinor: z.number(),
  reason: z.string().min(1).max(300),
  confidenceLabel: z.enum(["HIGH", "MEDIUM", "LOW"]),
});

export async function getPricingRecommendation(
  listingId: string,
): Promise<PricingRecommendation | null> {
  const cached = cacheGet(pricingCache, listingId);
  if (cached) return cached;

  const listing = await db.listing.findUnique({
    where: { id: listingId },
    select: { priceMinor: true, gameId: true, type: true },
  });
  if (!listing) return null;

  const since = new Date(utcMidnight().getTime() - 30 * DAY_MS);
  const signals = await db.marketSignal.findMany({
    where: { gameId: listing.gameId, categoryKind: listing.type, date: { gte: since } },
    orderBy: { date: "asc" },
    select: { date: true, orderCount: true, avgPriceMinor: true, searchCount: true },
  });

  if (signals.length < 3) {
    return {
      action: "KEEP",
      suggestedPriceMinor: listing.priceMinor,
      reason: "Insufficient market data.",
      confidenceLabel: "LOW",
    };
  }
  if (!isAiEnabled()) return null;

  const ai = await generateJSON({
    schema: PricingAiSchema,
    model: AI_MODELS.fast,
    maxTokens: 300,
    system:
      "You are a pricing assistant for a gaming marketplace seller. Given the listing's current price (minor units / paisa) and 30 days of market signals, recommend RAISE, LOWER or KEEP with a suggested price in the SAME minor units. Reply with ONLY a JSON object {action, suggestedPriceMinor, reason, confidenceLabel}. reason is one short sentence, no emojis.",
    prompt: `Current price (minor units): ${listing.priceMinor}\nSignals (oldest first): ${JSON.stringify(
      signals.map((s) => ({
        date: s.date.toISOString().slice(0, 10),
        orders: s.orderCount,
        avgPriceMinor: s.avgPriceMinor,
        searches: s.searchCount,
      })),
    )}`,
  });

  if (!ai) return null;
  // Clamp: positive integer; non-positive → keep current price.
  let suggested = Math.round(ai.suggestedPriceMinor);
  let action = ai.action;
  if (suggested <= 0) {
    suggested = listing.priceMinor;
    action = "KEEP";
  }
  const result: PricingRecommendation = {
    action,
    suggestedPriceMinor: suggested,
    reason: ai.reason,
    confidenceLabel: ai.confidenceLabel,
  };
  pricingCache.set(listingId, { value: result, expiresAt: Date.now() + TTL_MS });
  return result;
}

/** Most-run search terms in the last `days` days (Step 26) — admin demand signal. */
export async function getTrendingSearches(
  days = 7,
  take = 20,
): Promise<{ query: string; count: number }[]> {
  const since = new Date(utcMidnight().getTime() - days * DAY_MS);
  const rows = await db.searchLog.groupBy({
    by: ["query"],
    where: { createdAt: { gte: since } },
    _count: { _all: true },
    orderBy: { _count: { query: "desc" } },
    take,
  });
  return rows.map((r) => ({ query: r.query, count: r._count._all }));
}

/** Fire-and-forget search logging (Step 26). Never awaited, never throws to the caller. */
export function logSearch(query: string | undefined, gameSlug: string | undefined): void {
  const q = query?.trim();
  if (!q) return;
  void db.searchLog
    .create({ data: { query: q.slice(0, 500), gameId: gameSlug ?? null } })
    .catch(() => {});
}

export function captureForecastError(err: unknown): void {
  captureException(err);
}
