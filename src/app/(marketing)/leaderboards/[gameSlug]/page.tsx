import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { getGameLeaderboard } from "@/server/services/guides";
import { getUserBadges } from "@/server/services/badges";
import { UserAvatar } from "@/components/shared/user-avatar";

export const revalidate = 3600;

type Props = { params: Promise<{ gameSlug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { gameSlug } = await params;
  const game = await db.game.findUnique({ where: { slug: gameSlug }, select: { name: true } });
  if (!game) return { title: "Leaderboard" };
  return {
    title: `${game.name} — Seller Leaderboard`,
    description: `The top ${game.name} sellers on GETX, ranked by completed sales in the last 30 days.`,
  };
}

const MEDAL = ["🥇", "🥈", "🥉"];

export default async function GameLeaderboardPage({ params }: Props) {
  const { gameSlug } = await params;
  const game = await db.game.findUnique({ where: { slug: gameSlug }, select: { id: true, name: true } });
  if (!game) notFound();

  const board = await getGameLeaderboard(game.id, 10);
  // Badges per ranked seller (icon strip, max 5).
  const badgeMap = new Map(
    await Promise.all(
      board.map(async (r) => [r.userId, (await getUserBadges(r.userId)).slice(0, 5)] as const),
    ),
  );

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10">
      <Link href="/leaderboards" className="text-sm text-primary hover:underline">
        ← All leaderboards
      </Link>
      <h1 className="mt-2 font-heading text-3xl font-extrabold tracking-tight">
        {game.name} — Top sellers
      </h1>
      <p className="mt-1 mb-6 text-sm text-muted-foreground">
        Ranked by completed sales in the last 30 days.
      </p>

      {board.length === 0 ? (
        <p className="rounded-lg border border-border bg-card/40 p-4 text-sm text-muted-foreground">
          No completed sales for {game.name} in the last 30 days yet.
        </p>
      ) : (
        <ol className="flex flex-col gap-2">
          {board.map((r, i) => (
            <li key={r.sellerId} className="flex items-center gap-3 rounded-lg border border-border bg-card p-3">
              <span className="w-8 shrink-0 text-center font-heading text-lg font-bold tabular-nums">
                {MEDAL[i] ?? i + 1}
              </span>
              <UserAvatar name={r.displayName} image={r.image} size="sm" />
              <div className="min-w-0 flex-1">
                <Link href={`/sellers/${r.userId}`} className="block truncate font-semibold hover:text-primary">
                  {r.displayName}
                </Link>
                <div className="flex items-center gap-1.5 text-xs">
                  {(badgeMap.get(r.userId) ?? []).map((b) => (
                    <span key={b.badgeCode} title={b.badge.name} className="text-primary">
                      ★
                    </span>
                  ))}
                  {r.ratingCount > 0 ? (
                    <span className="text-warning">★ {r.ratingAvg.toFixed(1)} ({r.ratingCount})</span>
                  ) : (
                    <span className="text-faint">New seller</span>
                  )}
                </div>
              </div>
              <span className="shrink-0 font-heading text-sm font-bold tabular-nums">
                {r.completedSales} sales
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
