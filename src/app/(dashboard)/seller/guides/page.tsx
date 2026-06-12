import type { Metadata } from "next";
import Link from "next/link";
import { PlusIcon, BookOpenIcon } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { getSellerGuides } from "@/server/services/guides";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";

export const metadata: Metadata = { title: "My guides", robots: { index: false } };
export const dynamic = "force-dynamic";

const dateFmt = new Intl.DateTimeFormat("en-US", { dateStyle: "medium" });

export default async function SellerGuidesPage() {
  const session = await requireUser();
  const guides = await getSellerGuides(session.user.id);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">My guides</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Write guides to build trust and pull buyers to your listings.
          </p>
        </div>
        <Button render={<Link href="/seller/guides/new" />}>
          <PlusIcon className="size-4" aria-hidden="true" />
          New guide
        </Button>
      </div>

      {guides.length === 0 ? (
        <EmptyState
          icon={<BookOpenIcon />}
          title="No guides yet"
          description="Share what you know — a good guide earns the Guide Author badge and sends buyers your way."
          headingLevel="h2"
          action={<Button render={<Link href="/seller/guides/new" />}>Write your first guide</Button>}
        />
      ) : (
        <ul className="flex flex-col gap-2.5">
          {guides.map((g) => (
            <li key={g.id} className="flex items-center gap-3 rounded-lg border border-border bg-card p-3.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{g.title}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {g.viewCount} views · {g.likeCount} likes · {dateFmt.format(g.createdAt)}
                </p>
              </div>
              <span
                className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${g.published ? "bg-success/15 text-success" : "bg-warning/15 text-warning"}`}
              >
                {g.published ? "Published" : "In review"}
              </span>
              {g.published ? (
                <Link href={`/guides/${g.slug}`} className="shrink-0 text-xs font-semibold text-primary hover:underline">
                  View
                </Link>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
