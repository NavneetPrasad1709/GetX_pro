import { db } from "@/lib/db";
import {
  getAlgoliaAdminClient,
  ALGOLIA_INDEX_NAME,
  toAlgoliaRecord,
  type ListingForIndex,
} from "@/lib/algolia";

/**
 * Algolia index sync (Step 28). Fire-and-forget — NEVER throws into a listing create/update/status
 * transaction and never causes a 500. With no Algolia keys every function is a silent no-op (the
 * Postgres search keeps serving). A nightly cron (bulkSyncAllListings) heals any gaps.
 */

const indexSelect = {
  id: true,
  title: true,
  description: true,
  slug: true,
  priceMinor: true,
  currency: true,
  type: true,
  deliveryType: true,
  status: true,
  createdAt: true,
  game: { select: { slug: true, name: true } },
  category: { select: { slug: true, kind: true } },
  seller: { select: { displayName: true, trustScore: true, ratingAvg: true } },
} as const;

/** Upsert an ACTIVE listing into the index; delete it when it's not ACTIVE (or was removed). */
export async function syncListingToAlgolia(listingId: string): Promise<void> {
  const client = getAlgoliaAdminClient();
  if (!client) return; // not configured — silent no-op
  try {
    const listing = await db.listing.findUnique({ where: { id: listingId }, select: indexSelect });
    if (!listing) {
      // race: listing gone → make sure it's not stranded in the index
      await client.deleteObject({ indexName: ALGOLIA_INDEX_NAME, objectID: listingId }).catch(() => {});
      return;
    }
    if (listing.status === "ACTIVE") {
      await client.saveObject({ indexName: ALGOLIA_INDEX_NAME, body: toAlgoliaRecord(listing as ListingForIndex) });
    } else {
      await client.deleteObject({ indexName: ALGOLIA_INDEX_NAME, objectID: listingId });
    }
  } catch (err) {
    console.error("[algolia] syncListingToAlgolia failed for", listingId, err);
  }
}

/** Full reconciliation (nightly cron). Batches of 1000 (Algolia's per-call limit). Never aborts. */
export async function bulkSyncAllListings(): Promise<{ synced: number; deleted: number; errors: number }> {
  const client = getAlgoliaAdminClient();
  if (!client) return { synced: 0, deleted: 0, errors: 0 };

  const BATCH = 1000;
  let synced = 0;
  let deleted = 0;
  let errors = 0;
  let skip = 0;

  for (;;) {
    let rows: ListingForIndex[];
    try {
      rows = (await db.listing.findMany({
        select: indexSelect,
        skip,
        take: BATCH,
        orderBy: { id: "asc" },
      })) as unknown as ListingForIndex[];
    } catch (err) {
      console.error("[algolia] bulk fetch failed at skip", skip, err);
      errors += 1;
      break;
    }
    if (rows.length === 0) break;

    const active = rows.filter((r) => r.status === "ACTIVE");
    const inactive = rows.filter((r) => r.status !== "ACTIVE");

    if (active.length > 0) {
      try {
        await client.saveObjects({ indexName: ALGOLIA_INDEX_NAME, objects: active.map((r) => toAlgoliaRecord(r)) });
        synced += active.length;
      } catch (err) {
        console.error("[algolia] saveObjects batch failed", err);
        errors += 1;
      }
    }
    if (inactive.length > 0) {
      try {
        await client.deleteObjects({ indexName: ALGOLIA_INDEX_NAME, objectIDs: inactive.map((r) => r.id) });
        deleted += inactive.length;
      } catch (err) {
        console.error("[algolia] deleteObjects batch failed", err);
        errors += 1;
      }
    }

    skip += BATCH;
    if (rows.length < BATCH) break;
  }

  return { synced, deleted, errors };
}
