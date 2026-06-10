"use server";

import { captureException } from "@sentry/nextjs";
import { auth } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { db } from "@/lib/db";
import { generateText, AI_MODELS, isAiEnabled } from "@/lib/ai";
import { getPriceBenchmark } from "@/server/services/seller-analytics";
import { formatMoney } from "@/lib/money";

/**
 * AI pricing suggestion (Step 20). On-demand, never persisted. Re-auths + verifies the caller
 * owns the listing, grounds Claude (Haiku) in the listing's price + peer benchmark + recent sales,
 * and returns one concise recommendation. Degrades gracefully: no key / failure → fallback string,
 * never a 500. AI suggests — the seller decides; nothing is written.
 */

const FALLBACK = "AI pricing unavailable — check API key.";

export type AIPricingResult =
  | { ok: true; suggestion: string; hasBenchmark: boolean }
  | { ok: false; error: string };

export async function getAIPricingSuggestion(listingId: string): Promise<AIPricingResult> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "Please sign in." };
  if (typeof listingId !== "string" || listingId.length === 0 || listingId.length > 64) {
    return { ok: false, error: "Invalid listing." };
  }
  if (!rateLimit(`ai-price:${session.user.id}`, { limit: 20, windowMs: 60_000 }).ok) {
    return { ok: false, error: "Too many requests — wait a moment." };
  }

  const listing = await db.listing.findUnique({
    where: { id: listingId },
    select: {
      priceMinor: true,
      currency: true,
      title: true,
      seller: { select: { userId: true } },
      game: { select: { name: true } },
      category: { select: { name: true } },
    },
  });
  if (!listing) return { ok: false, error: "Listing not found." };
  if (listing.seller.userId !== session.user.id && session.user.role !== "ADMIN") {
    return { ok: false, error: "You do not own this listing." };
  }

  const benchmark = await getPriceBenchmark(listingId);

  // No AI key → graceful fallback (still tell the caller whether a benchmark exists).
  if (!isAiEnabled()) {
    return { ok: true, suggestion: FALLBACK, hasBenchmark: benchmark !== null };
  }

  try {
    const start = new Date(Date.now() - 30 * 86_400_000);
    const completed30d = await db.order.count({
      where: { listingId, status: "COMPLETED", createdAt: { gte: start } },
    });

    const cur = listing.currency;
    const benchLine = benchmark
      ? `Peer prices in the same game + category (${benchmark.sampleSize} active listing${benchmark.sampleSize === 1 ? "" : "s"}): average ${formatMoney(benchmark.avgMinor, cur)}, lowest ${formatMoney(benchmark.minMinor, cur)}, highest ${formatMoney(benchmark.maxMinor, cur)}.`
      : "No peer pricing data is available for this game + category.";

    const suggestion = await generateText({
      model: AI_MODELS.fast,
      maxTokens: 220,
      system:
        "You are a pricing advisor for sellers on GETX, a gaming marketplace. Reply with ONE concise, practical sentence of advice, then on a new line a suggested price range formatted exactly as 'Suggested: <low>-<high>'. No preamble, no emojis. Use only the data provided; never invent numbers.",
      prompt: `Listing: "${listing.title}" (${listing.game.name} - ${listing.category.name}).\nCurrent price: ${formatMoney(listing.priceMinor, cur)}.\n${benchLine}\nCompleted sales in the last 30 days: ${completed30d}.\nShould the seller raise, lower, or hold this price?`,
    });

    return {
      ok: true,
      suggestion: suggestion ?? FALLBACK,
      hasBenchmark: benchmark !== null,
    };
  } catch (err) {
    captureException(err);
    return { ok: true, suggestion: FALLBACK, hasBenchmark: benchmark !== null };
  }
}
