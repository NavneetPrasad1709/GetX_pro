import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { EyeIcon } from "lucide-react";
import { getGuideBySlug } from "@/server/services/guides";
import { getUserBadges } from "@/server/services/badges";
import { GuideMarkdown } from "@/components/community/guide-markdown";
import { GuideLikeButton } from "@/components/community/guide-like-button";
import { GuideViewTracker } from "@/components/community/guide-view-tracker";
import { UserAvatar } from "@/components/shared/user-avatar";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

function plainExcerpt(markdown: string, max = 160): string {
  return markdown.replace(/[#*`_>[\]()!-]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const guide = await getGuideBySlug(slug);
  if (!guide || !guide.published) return { title: "Guide" };
  return {
    title: `${guide.title} | GETX Guides`,
    description: plainExcerpt(guide.content),
  };
}

const dateFmt = new Intl.DateTimeFormat("en-US", { dateStyle: "medium" });

export default async function GuideDetailPage({ params }: Props) {
  const { slug } = await params;
  const guide = await getGuideBySlug(slug);
  if (!guide || !guide.published) notFound();

  const badges = (await getUserBadges(guide.author.id)).slice(0, 5);

  return (
    <article className="mx-auto w-full max-w-2xl px-4 py-10">
      <GuideViewTracker guideId={guide.id} />
      <Link href="/guides" className="text-sm text-primary hover:underline">
        ← All guides
      </Link>

      <span className="mt-4 inline-block rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
        {guide.game.name}
      </span>
      {/* seller-entered: not translated */}
      <h1 className="mt-2 font-heading text-3xl font-extrabold tracking-tight">{guide.title}</h1>

      {/* author card */}
      <div className="mt-4 flex items-center gap-3 border-y border-border py-3">
        <UserAvatar name={guide.author.name} image={guide.author.image} size="sm" />
        <div className="min-w-0 flex-1">
          {guide.author.sellerProfile ? (
            <Link
              href={`/sellers/${guide.author.sellerProfile.id}`}
              className="block truncate text-sm font-semibold hover:text-primary"
            >
              {guide.author.name ?? "GETX seller"}
            </Link>
          ) : (
            <span className="block truncate text-sm font-semibold">
              {guide.author.name ?? "GETX seller"}
            </span>
          )}
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            {dateFmt.format(guide.createdAt)}
            <span className="inline-flex items-center gap-1">
              <EyeIcon className="size-3.5" aria-hidden="true" />
              {guide.viewCount}
            </span>
            {badges.map((b) => (
              <span key={b.badgeCode} title={b.badge.name} className="text-primary">★</span>
            ))}
          </p>
        </div>
        <GuideLikeButton guideId={guide.id} initialCount={guide.likeCount} />
      </div>

      <div className="mt-6">
        <GuideMarkdown content={guide.content} />
      </div>
    </article>
  );
}
