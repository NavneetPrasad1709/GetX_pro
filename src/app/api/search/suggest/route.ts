import { db } from "@/lib/db";
import { getClientIp, rateLimit } from "@/lib/rate-limit";

/**
 * Search autocomplete (P3-T4) — Postgres fallback so suggestions work WITHOUT
 * Algolia keys (the InstantSearchBar UI, wired by the owner, prefers Algolia
 * when configured and falls back to this). Public, read-only, IP rate-limited,
 * debounced client-side. Returns top listing + game matches for a prefix.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SuggestResponse = {
  listings: {
    slug: string;
    title: string;
    priceMinor: number;
    currency: string;
    game: string;
  }[];
  games: { slug: string; name: string }[];
};

export async function GET(req: Request): Promise<Response> {
  const q = (new URL(req.url).searchParams.get("q") ?? "").trim().slice(0, 60);
  const empty: SuggestResponse = { listings: [], games: [] };
  if (q.length < 2) return Response.json(empty);

  const ip = await getClientIp();
  if (!rateLimit(`suggest:${ip}`, { limit: 40, windowMs: 60_000 }).ok) {
    return Response.json(empty, { status: 429 });
  }

  try {
    const [listings, games] = await Promise.all([
      db.listing.findMany({
        where: {
          status: "ACTIVE",
          stock: { gt: 0 },
          title: { contains: q, mode: "insensitive" },
        },
        orderBy: [{ seller: { totalSales: "desc" } }, { createdAt: "desc" }],
        take: 5,
        select: {
          slug: true,
          title: true,
          priceMinor: true,
          currency: true,
          game: { select: { name: true } },
        },
      }),
      db.game.findMany({
        where: { isActive: true, name: { contains: q, mode: "insensitive" } },
        orderBy: { sortOrder: "asc" },
        take: 3,
        select: { slug: true, name: true },
      }),
    ]);

    const body: SuggestResponse = {
      listings: listings.map((l) => ({
        slug: l.slug,
        title: l.title,
        priceMinor: l.priceMinor,
        currency: l.currency,
        game: l.game.name,
      })),
      games: games.map((g) => ({ slug: g.slug, name: g.name })),
    };
    return Response.json(body);
  } catch (err) {
    console.error("[search/suggest]", err);
    return Response.json(empty);
  }
}
