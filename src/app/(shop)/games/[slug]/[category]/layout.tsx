import { notFound } from "next/navigation";
import { getGameBySlug } from "@/server/services/catalog";

type Props = {
  children: React.ReactNode;
  params: Promise<{ slug: string; category: string }>;
};

/**
 * Existence gate for /games/[slug]/[category] — same real-HTTP-404
 * rationale as the game layout one level up (see that file). The parent
 * layout already validated the game; `getGameBySlug` is cache()-wrapped,
 * so this is the SAME query result, not a second round trip.
 *
 * Note: layouts cannot read searchParams, so an out-of-range ?page= is
 * handled in the page itself (soft 404 + noindex) — acceptable because no
 * internal link ever points past the last page.
 */
export default async function CategoryLayout({ children, params }: Props) {
  const { slug, category } = await params;
  const game = await getGameBySlug(slug);
  if (!game?.categories.some((c) => c.slug === category)) notFound();

  return children;
}
