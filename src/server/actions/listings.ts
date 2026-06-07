"use server";

import { revalidatePath } from "next/cache";
import { auth, ForbiddenError } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import {
  listingFormSchema,
  listingIdSchema,
  listingStatusActionSchema,
  updateListingSchema,
} from "@/lib/validators/listing";
import {
  createListing,
  ListingServiceError,
  removeListing,
  setListingStatus,
  updateListing,
} from "@/server/services/listings";

/**
 * Listing server actions (Step 06). Every mutation:
 *   1. auth() — logged in? (role/ownership enforced in the service, in-tx)
 *   2. rate limit — per user (writes) per guardrails §7
 *   3. Zod re-validation — never trust the client payload
 *   4. service call — business logic lives in src/server/services only
 */

export type ListingActionResult = {
  ok: boolean;
  error?: string;
  listingId?: string;
};

const GENERIC_ERROR = "Something went wrong. Please try again.";

function firstIssue(error: { issues: Array<{ message: string }> }): string {
  return error.issues[0]?.message ?? "Invalid input.";
}

function toSafeError(err: unknown, context: string): ListingActionResult {
  if (err instanceof ListingServiceError) {
    return { ok: false, error: err.message };
  }
  if (err instanceof ForbiddenError) {
    return { ok: false, error: "You do not have access to this listing." };
  }
  console.error(`[${context}]`, err);
  return { ok: false, error: GENERIC_ERROR };
}

async function requireSessionUser() {
  const session = await auth();
  if (!session?.user?.id) return null;
  return { id: session.user.id, role: session.user.role };
}

async function writeLimit(
  key: string,
  userId: string,
): Promise<string | null> {
  // Key on the JWT-verified userId ONLY. Mixing in the client IP would let an
  // authenticated attacker rotate X-Forwarded-For to mint fresh buckets and
  // bypass the cap — IP belongs in keys only for anonymous flows.
  const rl = rateLimit(`${key}:${userId}`, {
    limit: 20,
    windowMs: 60_000,
  });
  return rl.ok ? null : `Too many requests. Try again in ${rl.retryAfterSec}s.`;
}

/** Seller pages re-render with fresh data after any listing mutation. */
function revalidateSellerPages(): void {
  revalidatePath("/seller");
  revalidatePath("/seller/listings");
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

export async function createListingAction(
  raw: unknown,
): Promise<ListingActionResult> {
  const user = await requireSessionUser();
  if (!user) return { ok: false, error: "You must be logged in." };

  const limited = await writeLimit("listing-create", user.id);
  if (limited) return { ok: false, error: limited };

  const parsed = listingFormSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };

  try {
    const listing = await createListing(user, parsed.data);
    revalidateSellerPages();
    return { ok: true, listingId: listing.id };
  } catch (err) {
    return toSafeError(err, "createListingAction");
  }
}

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------

export async function updateListingAction(
  raw: unknown,
): Promise<ListingActionResult> {
  const user = await requireSessionUser();
  if (!user) return { ok: false, error: "You must be logged in." };

  const limited = await writeLimit("listing-update", user.id);
  if (limited) return { ok: false, error: limited };

  const parsed = updateListingSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };

  try {
    const listing = await updateListing(
      user,
      parsed.data.listingId,
      parsed.data.values,
    );
    revalidateSellerPages();
    return { ok: true, listingId: listing.id };
  } catch (err) {
    return toSafeError(err, "updateListingAction");
  }
}

// ---------------------------------------------------------------------------
// Pause / activate
// ---------------------------------------------------------------------------

export async function setListingStatusAction(
  raw: unknown,
): Promise<ListingActionResult> {
  const user = await requireSessionUser();
  if (!user) return { ok: false, error: "You must be logged in." };

  const limited = await writeLimit("listing-status", user.id);
  if (limited) return { ok: false, error: limited };

  const parsed = listingStatusActionSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };

  try {
    const listing = await setListingStatus(
      user,
      parsed.data.listingId,
      parsed.data.action,
    );
    revalidateSellerPages();
    return { ok: true, listingId: listing.id };
  } catch (err) {
    return toSafeError(err, "setListingStatusAction");
  }
}

// ---------------------------------------------------------------------------
// Remove (soft delete)
// ---------------------------------------------------------------------------

export async function removeListingAction(
  raw: unknown,
): Promise<ListingActionResult> {
  const user = await requireSessionUser();
  if (!user) return { ok: false, error: "You must be logged in." };

  const limited = await writeLimit("listing-remove", user.id);
  if (limited) return { ok: false, error: limited };

  const parsed = listingIdSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };

  try {
    const listing = await removeListing(user, parsed.data.listingId);
    revalidateSellerPages();
    return { ok: true, listingId: listing.id };
  } catch (err) {
    return toSafeError(err, "removeListingAction");
  }
}
