"use server";

import { auth } from "@/lib/auth";
import { recordRecentlyViewed } from "@/server/services/recently-viewed";

/**
 * Record a recently-viewed listing (P3-T2). Fired fire-and-forget by a small
 * client tracker on the listing page so it runs per actual view (the page is
 * ISR-cached, so the page body can't do this). No-op for anonymous users.
 */
const ID_RE = /^[a-z0-9]+$/i;

export async function recordRecentlyViewedAction(listingId: unknown): Promise<void> {
  const session = await auth();
  if (!session?.user?.id) return;
  if (typeof listingId !== "string" || listingId.length > 64 || !ID_RE.test(listingId)) {
    return;
  }
  try {
    await recordRecentlyViewed(session.user.id, listingId);
  } catch {
    // best-effort — never surface to the user
  }
}
