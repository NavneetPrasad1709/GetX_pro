import type { Metadata } from "next";
import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { GuideModerationButtons } from "@/components/admin/guide-moderation-buttons";

export const metadata: Metadata = { title: "Guides — Admin", robots: { index: false } };
export const dynamic = "force-dynamic";

const dateFmt = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium" });

type Props = { searchParams: Promise<{ status?: string }> };

export default async function AdminGuidesPage({ searchParams }: Props) {
  await requireRole("ADMIN");
  const sp = await searchParams;
  const filter = sp.status === "draft" ? false : sp.status === "published" ? true : undefined;

  const guides = await db.guide.findMany({
    where: filter === undefined ? {} : { published: filter },
    orderBy: [{ published: "asc" }, { createdAt: "desc" }],
    take: 100,
    include: { author: { select: { name: true, email: true } }, game: { select: { name: true } } },
  });

  const tabs = [
    { key: "all", label: "All" },
    { key: "draft", label: "In review" },
    { key: "published", label: "Published" },
  ] as const;
  const active = sp.status === "draft" ? "draft" : sp.status === "published" ? "published" : "all";

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Community guides</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Review drafts and publish or unpublish guides. Every action is audit-logged.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {tabs.map((t) => (
          <Link
            key={t.key}
            href={t.key === "all" ? "/admin/guides" : `/admin/guides?status=${t.key}`}
            aria-current={active === t.key ? "page" : undefined}
            className={`rounded-full px-3 py-1 font-heading text-sm font-semibold ${active === t.key ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"}`}
          >
            {t.label}
          </Link>
        ))}
      </div>

      {guides.length === 0 ? (
        <p className="rounded-lg border border-border bg-card/40 p-4 text-sm text-muted-foreground">
          No guides {active === "all" ? "" : active === "draft" ? "in review" : "published"}.
        </p>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {guides.map((g) => (
            <li key={g.id} className="flex items-center gap-3 rounded-lg border border-border bg-card p-3.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{g.title}</p>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">
                  {g.author.name ?? g.author.email} · {g.game.name} · {g.viewCount} views · {dateFmt.format(g.createdAt)}
                </p>
              </div>
              {g.published ? (
                <Link href={`/guides/${g.slug}`} className="shrink-0 text-xs font-semibold text-primary hover:underline">
                  View
                </Link>
              ) : null}
              <GuideModerationButtons guideId={g.id} published={g.published} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
