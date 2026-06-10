"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import {
  editReviewSchema,
  replyReviewSchema,
  submitReviewSchema,
} from "@/lib/validators/review";
import {
  createReview,
  editReview,
  getSellerReviews,
  replyToReview,
  ReviewServiceError,
  type ReviewItem,
} from "@/server/services/reviews";

/**
 * Review server actions (Step 13). Standard shape: auth → per-user rate limit →
 * Zod → service. ALL eligibility (must own a COMPLETED order, one-per-order,
 * profanity, ownership) is enforced inside the service.
 */

export type ReviewActionResult = { ok: true } | { ok: false; error: string };

const GENERIC = "Something went wrong. Please try again.";

async function currentUserId(): Promise<string | null> {
  const session = await auth();
  return session?.user?.id ?? null;
}

export async function submitReviewAction(
  raw: unknown,
): Promise<ReviewActionResult> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: "Please log in to leave a review." };

  const rl = rateLimit(`review:${userId}`, { limit: 15, windowMs: 60_000 });
  if (!rl.ok) {
    return { ok: false, error: `Too many requests. Try again in ${rl.retryAfterSec}s.` };
  }

  const parsed = submitReviewSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  try {
    await createReview(
      userId,
      parsed.data.orderId,
      parsed.data.rating,
      parsed.data.comment || undefined,
    );
    revalidatePath(`/orders/${parsed.data.orderId}`);
    return { ok: true };
  } catch (err) {
    if (err instanceof ReviewServiceError) return { ok: false, error: err.message };
    // A rare create-race on the unique orderId surfaces as P2002 here.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return { ok: false, error: "You've already reviewed this order." };
    }
    console.error("[submitReviewAction]", err);
    return { ok: false, error: GENERIC };
  }
}

export async function editReviewAction(
  raw: unknown,
): Promise<ReviewActionResult> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: "Please log in." };

  const rl = rateLimit(`review-edit:${userId}`, { limit: 15, windowMs: 60_000 });
  if (!rl.ok) {
    return { ok: false, error: `Too many requests. Try again in ${rl.retryAfterSec}s.` };
  }

  const parsed = editReviewSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  try {
    await editReview(
      userId,
      parsed.data.reviewId,
      parsed.data.rating,
      parsed.data.comment || undefined,
    );
    return { ok: true };
  } catch (err) {
    if (err instanceof ReviewServiceError) return { ok: false, error: err.message };
    console.error("[editReviewAction]", err);
    return { ok: false, error: GENERIC };
  }
}

export async function replyToReviewAction(
  raw: unknown,
): Promise<ReviewActionResult> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: "Please log in." };

  const rl = rateLimit(`review-reply:${userId}`, { limit: 15, windowMs: 60_000 });
  if (!rl.ok) {
    return { ok: false, error: `Too many requests. Try again in ${rl.retryAfterSec}s.` };
  }

  const parsed = replyReviewSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  try {
    await replyToReview(userId, parsed.data.reviewId, parsed.data.reply);
    return { ok: true };
  } catch (err) {
    if (err instanceof ReviewServiceError) return { ok: false, error: err.message };
    console.error("[replyToReviewAction]", err);
    return { ok: false, error: GENERIC };
  }
}

const idShape = /^[a-z0-9]+$/i;

export type LoadReviewsResult =
  | { ok: true; reviews: ReviewItem[]; nextCursor: string | null }
  | { ok: false };

/**
 * Load the next page of a seller's reviews (public, read-only) — drives the
 * "Load more" button on the seller profile. Reviews carry no private data.
 */
export async function loadMoreReviewsAction(
  rawSellerId: unknown,
  rawCursor: unknown,
): Promise<LoadReviewsResult> {
  const sellerId =
    typeof rawSellerId === "string" && rawSellerId.length <= 64 && idShape.test(rawSellerId)
      ? rawSellerId
      : null;
  const cursor =
    typeof rawCursor === "string" && rawCursor.length <= 64 && idShape.test(rawCursor)
      ? rawCursor
      : undefined;
  if (!sellerId) return { ok: false };

  const page = await getSellerReviews(sellerId, { cursor, limit: 10 });
  return { ok: true, reviews: page.reviews, nextCursor: page.nextCursor };
}
