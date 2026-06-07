import { notFound } from "next/navigation";
import { getListingBySlug } from "@/server/services/marketplace";

type Props = {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
};

/**
 * Existence gate for /listing/[slug] — same real-HTTP-404 rationale as the
 * catalog layouts: metadata STREAMS (Next 15.2+), so a notFound() in the page's
 * generateMetadata can't set the status. This layout sits above every Suspense
 * boundary, so a bad/non-ACTIVE slug gets a REAL 404 (SEO hygiene). The
 * cache()-wrapped service makes this the SAME query the page + metadata reuse.
 *
 * No segment loading.tsx here on purpose (it would flush HTTP 200 before this
 * 404 can run) — the single listing query is fast, nothing needs streaming.
 */
export default async function ListingLayout({ children, params }: Props) {
  const { slug } = await params;
  const listing = await getListingBySlug(slug);
  if (!listing) notFound();

  return children;
}
