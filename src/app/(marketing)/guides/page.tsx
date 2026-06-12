import type { Metadata } from "next";
import Link from "next/link";
import { BookOpenIcon, HeartIcon, EyeIcon } from "lucide-react";
import { db } from "@/lib/db";
import { getPublishedGuides } from "@/server/services/guides";

export const metadata: Metadata = {
  title: "Community Guides",
  description: "Player-written guides for the games on GETX — tips, value, and how to trade safely.",
};
export const revalidate = 3600;

const PAGE_SIZE = 12;
const dateFmt = new Intl.DateTimeFormat("en-US", { dateStyle: "medium" });

type Props = { searchParams: Promise<{ game?: string; page?: string }> };

export default async function GuidesPage({ searchParams }: Props) {
  const sp = await searchParams;
  const gameSlug = typeof sp.game === "string" ? sp.game : undefined;
  const page = Math.max(1, Number(sp.page) || 1);

  const [games, guides] = await Promise.all([
    db.game.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" }, select: { slug: true, name: true } }),
    getPublishedGuides({ gameSlug, take: PAGE_SIZE + 1, skip: (page - 1) * PAGE_SIZE }),
  ]);
  const hasNext = guides.length > PAGE_SIZE;
  const shown = guides.slice(0, PAGE_SIZE);

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-10">
      <h1 className="flex items-center gap-2 font-heading text-3xl font-extrabold tracking-tight">
        <BookOpenIcon className="size-7 text-primary" aria-hidden="true" />
        Community guides
      </h1>
      <p className="mt-1 mb-6 text-sm text-muted-foreground">
        Written by sellers and players. Learn the meta, spot value, and trade safely.
      </p>

      <div className="mb-6 flex flex-wrap gap-2">
        <Link
          href="/guides"
          className={`rounded-full border px-3 py-1.5 font-heading text-sm font-semibold ${!gameSlug ? "border-primary/40 bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground"}`}
        >
          All
        </Link>
        {games.map((g) => (
          <Link
            key={g.slug}
            href={`/guides?game=${g.slug}`}
            className={`rounded-full border px-3 py-1.5 font-heading text-sm font-semibold ${gameSlug === g.slug ? "border-primary/40 bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground"}`}
          >
            {g.name}
          </Link>
        ))}
      </div>

      {shown.length === 0 ? (
        <p className="rounded-lg border border-border bg-card/40 p-4 text-sm text-muted-foreground">
          No guides published yet{gameSlug ? " for this game" : ""}. Sellers can write the first one.
        </p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {shown.map((g) => (
            <li key={g.id}>
              <Link
                href={`/guides/${g.slug}`}
                className="flex h-full flex-col gap-2 rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/40"
              >
                <span className="w-fit rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
                  {g.game.name}
                </span>
                {/* seller-entered: not translated */}
                <span className="line-clamp-2 font-heading text-base font-semibold">{g.title}</span>
                <span className="mt-auto flex items-center gap-3 text-xs text-muted-foreground">
                  <span>{g.author.name ?? "GETX seller"}</span>
                  <span className="inline-flex items-center gap-1">
                    <HeartIcon className="size-3.5" aria-hidden="true" />
                    {g.likeCount}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <EyeIcon className="size-3.5" aria-hidden="true" />
                    {g.viewCount}
                  </span>
                  <span className="ml-auto">{dateFmt.format(g.createdAt)}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {(page > 1 || hasNext) && (
        <div className="mt-6 flex justify-between">
          {page > 1 ? (
            <Link href={`/guides?${gameSlug ? `game=${gameSlug}&` : ""}page=${page - 1}`} className="text-sm font-semibold text-primary hover:underline">
              ← Newer
            </Link>
          ) : <span />}
          {hasNext ? (
            <Link href={`/guides?${gameSlug ? `game=${gameSlug}&` : ""}page=${page + 1}`} className="text-sm font-semibold text-primary hover:underline">
              Older →
            </Link>
          ) : <span />}
        </div>
      )}
    </div>
  );
}
