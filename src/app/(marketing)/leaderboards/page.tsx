import type { Metadata } from "next";
import Link from "next/link";
import { TrophyIcon } from "lucide-react";
import { db } from "@/lib/db";

export const metadata: Metadata = {
  title: "Seller Leaderboards",
  description: "The top-selling, most-trusted sellers on GETX — ranked by completed sales per game.",
};
export const revalidate = 3600;

export default async function LeaderboardsPage() {
  const [games, topSellers] = await Promise.all([
    db.game.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" }, select: { slug: true, name: true } }),
    db.sellerProfile.findMany({
      where: { totalSales: { gt: 0 } },
      orderBy: { totalSales: "desc" },
      take: 10,
      select: { id: true, displayName: true, totalSales: true, ratingAvg: true, ratingCount: true },
    }),
  ]);

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10">
      <div className="mb-6">
        <h1 className="flex items-center gap-2 font-heading text-3xl font-extrabold tracking-tight">
          <TrophyIcon className="size-7 text-primary" aria-hidden="true" />
          Leaderboards
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          The best sellers on GETX, by completed sales. Pick a game for its 30-day ranking.
        </p>
      </div>

      <div className="mb-8 flex flex-wrap gap-2">
        {games.map((g) => (
          <Link
            key={g.slug}
            href={`/leaderboards/${g.slug}`}
            className="rounded-full border border-border px-3 py-1.5 font-heading text-sm font-semibold text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
          >
            {g.name}
          </Link>
        ))}
      </div>

      <h2 className="mb-3 font-heading text-lg font-bold">All-time top sellers</h2>
      {topSellers.length === 0 ? (
        <p className="rounded-lg border border-border bg-card/40 p-4 text-sm text-muted-foreground">
          No sales yet — be the first to top the board.
        </p>
      ) : (
        <ol className="flex flex-col gap-2">
          {topSellers.map((s, i) => (
            <li
              key={s.id}
              className="flex items-center gap-3 rounded-lg border border-border bg-card p-3"
            >
              <span className="grid size-8 shrink-0 place-items-center rounded-full bg-muted font-heading text-sm font-bold tabular-nums">
                {i + 1}
              </span>
              <Link href={`/sellers/${s.id}`} className="min-w-0 flex-1 truncate font-semibold hover:text-primary">
                {s.displayName}
              </Link>
              {s.ratingCount > 0 ? (
                <span className="shrink-0 text-xs text-warning">★ {s.ratingAvg.toFixed(1)}</span>
              ) : null}
              <span className="shrink-0 font-heading text-sm font-bold tabular-nums">
                {s.totalSales} sales
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
