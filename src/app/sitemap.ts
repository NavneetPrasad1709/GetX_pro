import type { MetadataRoute } from "next";
import { siteConfig } from "@/config/site";
import { db } from "@/lib/db";
import { getCatalogTree } from "@/server/services/catalog";

// Google caps a single sitemap at 50,000 URLs. Past this, split into a sitemap
// index (sitemap.xml → sitemap-0.xml, sitemap-1.xml…). We cap the listing query
// well below and log a warning so the team knows when to split.
const SITEMAP_URL_CAP = 45_000;

// Re-generate at most hourly — catalog URLs change rarely.
export const revalidate = 3600;

/**
 * Sitemap: static pages + every game + every game/category page.
 * If the DB is unreachable we still serve the static routes instead of 500ing
 * (a broken sitemap hurts crawling more than a partial one).
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteConfig.url;
  const now = new Date();

  const staticEntries: MetadataRoute.Sitemap = [
    {
      url: `${base}/`,
      lastModified: now,
      changeFrequency: "daily",
      priority: 1,
    },
    {
      url: `${base}/games`,
      lastModified: now,
      changeFrequency: "daily",
      priority: 0.9,
    },
    // NOTE: /become-seller is auth-gated (redirects anonymous crawlers to
    // /login) so it must NOT be in the sitemap — only anonymous-200 URLs
    // belong here. Add a public seller landing page before re-listing it.

    // Legal pages — required for Razorpay/CoinGate merchant activation
    { url: `${base}/terms`, lastModified: now, changeFrequency: "monthly", priority: 0.5 },
    { url: `${base}/privacy`, lastModified: now, changeFrequency: "monthly", priority: 0.5 },
    { url: `${base}/refund-policy`, lastModified: now, changeFrequency: "monthly", priority: 0.5 },
    // Seller + buyer content
    { url: `${base}/fees`, lastModified: now, changeFrequency: "monthly", priority: 0.7 },
    { url: `${base}/seller-guide`, lastModified: now, changeFrequency: "monthly", priority: 0.7 },
    { url: `${base}/payouts`, lastModified: now, changeFrequency: "monthly", priority: 0.7 },
    // Marketing / trust content
    { url: `${base}/how-it-works`, lastModified: now, changeFrequency: "monthly", priority: 0.6 },
    { url: `${base}/help`, lastModified: now, changeFrequency: "monthly", priority: 0.6 },
    { url: `${base}/about`, lastModified: now, changeFrequency: "monthly", priority: 0.6 },
    { url: `${base}/trust-safety`, lastModified: now, changeFrequency: "monthly", priority: 0.6 },
    // Stubs
    { url: `${base}/contact`, lastModified: now, changeFrequency: "monthly", priority: 0.4 },
    { url: `${base}/blog`, lastModified: now, changeFrequency: "monthly", priority: 0.4 },
    { url: `${base}/careers`, lastModified: now, changeFrequency: "monthly", priority: 0.4 },
  ];

  try {
    const games = await getCatalogTree();

    const gameEntries: MetadataRoute.Sitemap = games.map((game) => ({
      url: `${base}/games/${game.slug}`,
      lastModified: now,
      changeFrequency: "daily",
      priority: 0.8,
    }));

    const categoryEntries: MetadataRoute.Sitemap = games.flatMap((game) =>
      game.categories.map((category) => ({
        url: `${base}/games/${game.slug}/${category.slug}`,
        lastModified: now,
        changeFrequency: "daily",
        priority: 0.7,
      })),
    );

    // Long-tail value: every ACTIVE listing + every public (non-banned) seller.
    // These were previously invisible to crawlers (Prompt 17).
    const [listings, sellers] = await Promise.all([
      db.listing.findMany({
        where: { status: "ACTIVE" },
        select: { slug: true, updatedAt: true },
        orderBy: { updatedAt: "desc" },
        take: SITEMAP_URL_CAP,
      }),
      db.sellerProfile.findMany({
        where: { user: { bannedAt: null } },
        select: { id: true, updatedAt: true },
        orderBy: { updatedAt: "desc" },
        take: SITEMAP_URL_CAP,
      }),
    ]);

    if (listings.length >= SITEMAP_URL_CAP) {
      // TODO: split into a sitemap index once listings approach 50k (Google's cap).
      console.warn(
        `[sitemap] listing count hit the ${SITEMAP_URL_CAP} cap — split into a sitemap index soon.`,
      );
    }

    const listingEntries: MetadataRoute.Sitemap = listings.map((l) => ({
      url: `${base}/listing/${l.slug}`,
      lastModified: l.updatedAt,
      changeFrequency: "weekly",
      priority: 0.6,
    }));

    const sellerEntries: MetadataRoute.Sitemap = sellers.map((s) => ({
      url: `${base}/sellers/${s.id}`,
      lastModified: s.updatedAt,
      changeFrequency: "weekly",
      priority: 0.5,
    }));

    return [
      ...staticEntries,
      ...gameEntries,
      ...categoryEntries,
      ...listingEntries,
      ...sellerEntries,
    ];
  } catch (error) {
    console.error("[sitemap] catalog query failed, serving static-only:", error);
    return staticEntries;
  }
}
