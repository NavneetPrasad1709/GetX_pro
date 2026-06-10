import { z } from "zod";

/** Auto-delivery action input schemas (Step 19). */

const id = z.string().trim().min(1).max(64).regex(/^[a-z0-9]+$/i, "Invalid id");

export const addDeliveryItemsSchema = z.object({
  listingId: id,
  // Raw textarea content — one item per line. Bounded to avoid abuse.
  rawText: z.string().min(1).max(500_000),
});

export const deleteDeliveryItemSchema = z.object({
  itemId: id,
  listingId: id, // for revalidation of the edit page
});
