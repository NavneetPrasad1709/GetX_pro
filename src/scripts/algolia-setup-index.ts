/**
 * One-off Algolia index setup (Step 28). Configures searchable attributes, facets, custom ranking,
 * typo tolerance, and the price/newest sort replicas. Run ONCE per environment after provisioning
 * an Algolia app + setting ALGOLIA_APP_ID + ALGOLIA_ADMIN_KEY:
 *   npx tsx src/scripts/algolia-setup-index.ts
 */
import { getAlgoliaAdminClient, ALGOLIA_INDEX_NAME } from "../lib/algolia";

async function main() {
  const client = getAlgoliaAdminClient();
  if (!client) {
    console.log("⚠️  Algolia not configured — set ALGOLIA_APP_ID + ALGOLIA_ADMIN_KEY, then re-run.");
    return;
  }

  const replicas = [
    `${ALGOLIA_INDEX_NAME}_price_asc`,
    `${ALGOLIA_INDEX_NAME}_price_desc`,
    `${ALGOLIA_INDEX_NAME}_newest`,
  ];

  await client.setSettings({
    indexName: ALGOLIA_INDEX_NAME,
    indexSettings: {
      searchableAttributes: ["title", "description", "gameName", "sellerUsername"],
      attributesForFaceting: [
        "filterOnly(status)", // always filtered to ACTIVE, never a user-facing facet
        "gameName",
        "gameSlug",
        "categoryKind",
        "currency",
        "deliveryType",
      ],
      customRanking: ["desc(sellerTrustScore)", "desc(sellerRatingAvg)"],
      typoTolerance: true,
      replicas,
    },
  });

  // Replica rankings (price + recency sorts).
  await client.setSettings({ indexName: replicas[0], indexSettings: { ranking: ["asc(priceMinor)", "typo", "geo", "words", "filters", "proximity", "attribute", "exact", "custom"] } });
  await client.setSettings({ indexName: replicas[1], indexSettings: { ranking: ["desc(priceMinor)", "typo", "geo", "words", "filters", "proximity", "attribute", "exact", "custom"] } });
  await client.setSettings({ indexName: replicas[2], indexSettings: { ranking: ["desc(createdAt)", "typo", "geo", "words", "filters", "proximity", "attribute", "exact", "custom"] } });

  console.log(`✅ Configured ${ALGOLIA_INDEX_NAME} + ${replicas.length} sort replicas.`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
