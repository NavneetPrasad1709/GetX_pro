import type { MetadataRoute } from "next";
import { siteConfig } from "@/config/site";
import { getCatalogTree } from "@/server/services/catalog";

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

    return [...staticEntries, ...gameEntries, ...categoryEntries];
  } catch (error) {
    console.error("[sitemap] catalog query failed, serving static-only:", error);
    return staticEntries;
  }
}
