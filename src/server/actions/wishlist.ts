"use server";

import * as Sentry from "@sentry/nextjs";
import { auth } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { toggleWishlist, WishlistError } from "@/server/services/wishlist";

/**
 * Wishlist toggle action (P3-T1). Auth + rate-limit re-checked here. Returns a
 * `needsAuth` flag for anonymous users so the owner's UI can open a "sign up to
 * save" modal instead of a silent no-op.
 */

const ID_RE = /^[a-z0-9]+$/i;

export type WishlistResult =
  | { ok: true; wishlisted: boolean }
  | { ok: false; error: string; needsAuth?: boolean };

export async function toggleWishlistAction(
  listingId: unknown,
): Promise<WishlistResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false, error: "Sign in to save listings.", needsAuth: true };
  }
  if (typeof listingId !== "string" || listingId.length > 64 || !ID_RE.test(listingId)) {
    return { ok: false, error: "Invalid listing." };
  }
  if (!rateLimit(`wishlist:${session.user.id}`, { limit: 30, windowMs: 60_000 }).ok) {
    return { ok: false, error: "Too many requests — slow down a moment." };
  }
  try {
    const { wishlisted } = await toggleWishlist(session.user.id, listingId);
    return { ok: true, wishlisted };
  } catch (err) {
    if (err instanceof WishlistError) return { ok: false, error: err.message };
    Sentry.captureException(err);
    console.error("[toggleWishlistAction]", err);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}
