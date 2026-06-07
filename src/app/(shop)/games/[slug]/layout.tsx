import { notFound } from "next/navigation";
import { getGameBySlug } from "@/server/services/catalog";

type Props = {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
};

/**
 * Existence gate for /games/[slug]/**.
 *
 * Why a layout and not generateMetadata/page: since Next 15.2 metadata
 * STREAMS, and `loading.tsx` flushes the shell (HTTP 200) before the page
 * body runs — so a notFound() thrown there can only soft-404 (noindex).
 * A layout sits ABOVE the loading boundary: it must resolve before the
 * first byte flushes, so notFound() here returns a real HTTP 404 to
 * crawlers. The game query is cache()-wrapped, so metadata + page reuse
 * this exact lookup — zero extra DB round trips.
 */
export default async function GameLayout({ children, params }: Props) {
  const { slug } = await params;
  const game = await getGameBySlug(slug);
  if (!game) notFound();

  return children;
}
