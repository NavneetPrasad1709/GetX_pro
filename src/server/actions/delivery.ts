"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import {
  addDeliveryItemsSchema,
  deleteDeliveryItemSchema,
} from "@/lib/validators/delivery";
import {
  addDeliveryItems,
  deleteDeliveryItem,
  DeliveryServiceError,
} from "@/server/services/delivery";

/**
 * Auto-delivery server actions (Step 19). Standard shape: auth → rate limit → Zod →
 * service. Ownership + INSTANT-type + encryption-availability are enforced in the service.
 */

const GENERIC = "Something went wrong. Please try again.";
const MAX_PER_UPLOAD = 500;

async function currentUserId(): Promise<string | null> {
  const session = await auth();
  return session?.user?.id ?? null;
}

export type DeliveryActionResult =
  | { ok: true; added?: number }
  | { ok: false; error: string };

export async function addDeliveryItemsAction(
  raw: unknown,
): Promise<DeliveryActionResult> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: "Please log in." };

  const rl = rateLimit(`delivery-add:${userId}`, { limit: 30, windowMs: 60_000 });
  if (!rl.ok) {
    return { ok: false, error: `Too many requests. Try again in ${rl.retryAfterSec}s.` };
  }

  const parsed = addDeliveryItemsSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const lines = [
    ...new Set(parsed.data.rawText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)),
  ];
  if (lines.length === 0) return { ok: false, error: "Add at least one item." };
  if (lines.length > MAX_PER_UPLOAD) {
    return { ok: false, error: `Max ${MAX_PER_UPLOAD} items per upload.` };
  }

  try {
    const added = await addDeliveryItems(parsed.data.listingId, userId, lines);
    revalidatePath(`/seller/listings/${parsed.data.listingId}/edit`);
    return { ok: true, added };
  } catch (err) {
    if (err instanceof DeliveryServiceError) return { ok: false, error: err.message };
    console.error("[addDeliveryItemsAction]", err);
    return { ok: false, error: GENERIC };
  }
}

export async function deleteDeliveryItemAction(
  raw: unknown,
): Promise<DeliveryActionResult> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: "Please log in." };

  const parsed = deleteDeliveryItemSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Invalid input." };

  try {
    await deleteDeliveryItem(parsed.data.itemId, userId);
    revalidatePath(`/seller/listings/${parsed.data.listingId}/edit`);
    return { ok: true };
  } catch (err) {
    if (err instanceof DeliveryServiceError) return { ok: false, error: err.message };
    console.error("[deleteDeliveryItemAction]", err);
    return { ok: false, error: GENERIC };
  }
}
