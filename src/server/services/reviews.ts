import { cache } from "react";
import { Prisma } from "@prisma/client";
import { captureException } from "@sentry/nextjs";
import { db } from "@/lib/db";
import { containsProfanity } from "@/lib/profanity";
import { recomputeSellerTrustAndLevel } from "@/server/services/trust-score";
import { notifyNewReview } from "@/server/services/notifications";
import { fireFraudSignal } from "@/server/services/fraud/dispatch";
import {
  checkReviewVelocity,
  checkReviewSameIp,
} from "@/server/services/fraud/signals";
import {
  listingCardInclude,
  toListingCardData,
} from "@/server/services/catalog";
import type { ListingCardData } from "@/components/marketplace/listing-card";

/**
 * Reviews service (Step 13) — verified-buyer reviews that drive seller trust.
 * SERVER-SIDE ONLY. Eligibility is enforced here: only the BUYER of a COMPLETED
 * order can review it, exactly once (`Review.orderId` unique). On every change
 * the seller's cached `ratingAvg`/`ratingCount` are recomputed FROM the rows in
 * the SAME transaction, so the aggregate can never drift from the reviews.
 */

export class ReviewServiceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReviewServiceError";
  }
}

const REVIEWS_PAGE = 10;
const MAX_PAGE = 50;

type Tx = Prisma.TransactionClient;

function cleanComment(comment: string | undefined | null): string | null {
  const trimmed = comment?.trim();
  if (!trimmed) return null;
  if (containsProfanity(trimmed)) {
    throw new ReviewServiceError(
      "Please remove inappropriate language before posting.",
    );
  }
  return trimmed;
}

/**
 * Lock the seller row so concurrent review writes for the SAME seller serialize.
 * Without this, two reviews committing at once each recompute against a snapshot
 * missing the other's row → the cached count/avg drifts from the real rows. Call
 * BEFORE the insert/update so the recompute below always sees a consistent set.
 */
async function lockSellerForRating(tx: Tx, sellerId: string): Promise<void> {
  await tx.$queryRaw`SELECT id FROM "SellerProfile" WHERE id = ${sellerId} FOR UPDATE`;
}

/** Recompute the seller's rating aggregate FROM the review rows (single truth). */
async function recomputeSellerRating(tx: Tx, sellerId: string): Promise<void> {
  const agg = await tx.review.aggregate({
    where: { sellerId },
    _avg: { rating: true },
    _count: { _all: true },
  });
  await tx.sellerProfile.update({
    where: { id: sellerId },
    data: {
      ratingAvg: agg._avg.rating ?? 0,
      ratingCount: agg._count._all,
    },
  });
}

// --- create ----------------------------------------------------------------

export async function createReview(
  userId: string,
  orderId: string,
  rating: number,
  comment: string | undefined,
): Promise<void> {
  const clean = cleanComment(comment);
  let sellerProfileId = "";
  let sellerUserId = "";
  let listingTitle = "";

  await db.$transaction(async (tx) => {
    const order = await tx.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        status: true,
        buyerId: true,
        sellerId: true,
        seller: { select: { userId: true } },
        listing: { select: { title: true } },
      },
    });
    // Not the buyer → identical to "not found" (no enumeration).
    if (!order || order.buyerId !== userId) {
      throw new ReviewServiceError("Order not found.");
    }
    if (order.status !== "COMPLETED") {
      throw new ReviewServiceError(
        "You can review an order once it's completed.",
      );
    }
    // Structurally impossible (a seller can't buy their own listing) but assert.
    if (order.seller.userId === userId) {
      throw new ReviewServiceError("You can't review your own sale.");
    }

    // Serialize rating recompute per seller (see lockSellerForRating).
    await lockSellerForRating(tx, order.sellerId);

    const existing = await tx.review.findUnique({
      where: { orderId: order.id },
      select: { id: true },
    });
    if (existing) {
      throw new ReviewServiceError("You've already reviewed this order.");
    }

    await tx.review.create({
      data: {
        orderId: order.id,
        buyerId: userId,
        sellerId: order.sellerId,
        rating,
        comment: clean,
      },
    });
    await recomputeSellerRating(tx, order.sellerId);
    sellerProfileId = order.sellerId;
    sellerUserId = order.seller.userId;
    listingTitle = order.listing.title;
  });

  // Post-commit fire-and-forget trust recompute (NEVER called inside a tx).
  if (sellerProfileId) {
    void recomputeSellerTrustAndLevel(sellerProfileId).catch(captureException);
    // Fraud signals (Prompt 16): review-ring detection.
    fireFraudSignal("review_velocity", checkReviewVelocity(sellerProfileId));
    fireFraudSignal("review_same_ip", checkReviewSameIp(sellerProfileId, userId));
    // Step 22: notify the seller of the new review.
    void notifyNewReview({
      sellerUserId,
      listingTitle,
      rating,
      orderId,
    }).catch(captureException);
  }
}

// --- edit (buyer edits their own review) ------------------------------------

export async function editReview(
  userId: string,
  reviewId: string,
  rating: number,
  comment: string | undefined,
): Promise<void> {
  const clean = cleanComment(comment);
  let sellerProfileId = "";

  await db.$transaction(async (tx) => {
    const review = await tx.review.findUnique({
      where: { id: reviewId },
      select: { id: true, buyerId: true, sellerId: true },
    });
    if (!review || review.buyerId !== userId) {
      throw new ReviewServiceError("Review not found.");
    }
    await lockSellerForRating(tx, review.sellerId);
    await tx.review.update({
      where: { id: reviewId },
      data: { rating, comment: clean },
    });
    await recomputeSellerRating(tx, review.sellerId);
    sellerProfileId = review.sellerId;
  });

  if (sellerProfileId) {
    void recomputeSellerTrustAndLevel(sellerProfileId).catch(captureException);
  }
}

// --- seller reply (the reviewed seller replies once) ------------------------

export async function replyToReview(
  userId: string,
  reviewId: string,
  reply: string,
): Promise<void> {
  const clean = reply.trim();
  if (!clean) throw new ReviewServiceError("Write a reply first.");
  if (containsProfanity(clean)) {
    throw new ReviewServiceError(
      "Please remove inappropriate language before posting.",
    );
  }

  const review = await db.review.findUnique({
    where: { id: reviewId },
    select: { id: true, sellerReply: true, seller: { select: { userId: true } } },
  });
  if (!review || review.seller.userId !== userId) {
    throw new ReviewServiceError("Review not found.");
  }
  // The reply is a permanent, one-time public statement — never overwritten
  // (a seller must not be able to swap a polite reply for a hostile one later).
  if (review.sellerReply) {
    throw new ReviewServiceError("You've already replied to this review.");
  }
  // Race-safe: only write while the reply is still empty; a concurrent
  // double-submit gets count 0 and is rejected.
  const res = await db.review.updateMany({
    where: { id: reviewId, sellerReply: null },
    data: { sellerReply: clean, sellerReplyAt: new Date() },
  });
  if (res.count === 0) {
    throw new ReviewServiceError("You've already replied to this review.");
  }
}

// --- order page context -----------------------------------------------------

export type OrderReviewContext = {
  /** buyer + COMPLETED + not yet reviewed → may post a review */
  canReview: boolean;
  isBuyer: boolean;
  existing: { id: string; rating: number; comment: string | null } | null;
};

/** Drives the order page's review box (post / edit / nothing). */
export async function getOrderReviewContext(
  userId: string,
  orderId: string,
): Promise<OrderReviewContext> {
  const order = await db.order.findUnique({
    where: { id: orderId },
    select: {
      status: true,
      buyerId: true,
      review: {
        select: { id: true, rating: true, comment: true, buyerId: true },
      },
    },
  });
  if (!order) return { canReview: false, isBuyer: false, existing: null };

  const isBuyer = order.buyerId === userId;
  const existing =
    order.review && order.review.buyerId === userId
      ? {
          id: order.review.id,
          rating: order.review.rating,
          comment: order.review.comment,
        }
      : null;

  return {
    canReview: isBuyer && order.status === "COMPLETED" && !existing,
    isBuyer,
    existing,
  };
}

/** True when this order already has a review (drives the seller "ask for review" nudge). */
export async function orderHasReview(orderId: string): Promise<boolean> {
  const review = await db.review.findUnique({
    where: { orderId },
    select: { id: true },
  });
  return review !== null;
}

// --- review feed (seller profile + listing detail) --------------------------

export type ReviewItem = {
  id: string;
  rating: number;
  comment: string | null;
  createdAt: string; // ISO
  edited: boolean;
  reviewerName: string;
  reviewerImage: string | null;
  sellerReply: string | null;
  sellerReplyAt: string | null;
};

const reviewSelect = {
  id: true,
  rating: true,
  comment: true,
  createdAt: true,
  updatedAt: true,
  sellerReply: true,
  sellerReplyAt: true,
  buyer: { select: { name: true, image: true } },
} satisfies Prisma.ReviewSelect;

type ReviewRow = Prisma.ReviewGetPayload<{ select: typeof reviewSelect }>;

function toReviewItem(row: ReviewRow): ReviewItem {
  return {
    id: row.id,
    rating: row.rating,
    comment: row.comment,
    createdAt: row.createdAt.toISOString(),
    // edited if it was updated more than a second after creation
    edited: row.updatedAt.getTime() - row.createdAt.getTime() > 1000,
    reviewerName: row.buyer.name ?? "GETX Buyer",
    reviewerImage: row.buyer.image,
    sellerReply: row.sellerReply,
    sellerReplyAt: row.sellerReplyAt?.toISOString() ?? null,
  };
}

export type ReviewPage = { reviews: ReviewItem[]; nextCursor: string | null };

/** A seller's reviews, newest first, cursor-paginated. Uses @@index([sellerId, createdAt]). */
export async function getSellerReviews(
  sellerId: string,
  opts: { cursor?: string; limit?: number } = {},
): Promise<ReviewPage> {
  const take = Math.min(Math.max(1, opts.limit ?? REVIEWS_PAGE), MAX_PAGE);
  const rows = await db.review.findMany({
    where: { sellerId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: take + 1,
    ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
    select: reviewSelect,
  });
  const hasMore = rows.length > take;
  const page = hasMore ? rows.slice(0, take) : rows;
  return {
    reviews: page.map(toReviewItem),
    nextCursor: hasMore ? page[page.length - 1].id : null,
  };
}

// --- public seller profile --------------------------------------------------

export type SellerPublicProfile = {
  id: string;
  /** the seller's User id — SERVER-SIDE ONLY (e.g. "is the viewer this seller?") */
  userId: string;
  displayName: string;
  bio: string | null;
  country: string | null;
  image: string | null;
  trustScore: number;
  ratingAvg: number;
  ratingCount: number;
  totalSales: number;
  kycVerified: boolean;
  sellerLevel: string;
  memberSince: Date;
};

export async function getSellerPublicProfile(
  sellerId: string,
): Promise<SellerPublicProfile | null> {
  const p = await db.sellerProfile.findUnique({
    where: { id: sellerId },
    select: {
      id: true,
      userId: true,
      displayName: true,
      bio: true,
      country: true,
      trustScore: true,
      ratingAvg: true,
      ratingCount: true,
      totalSales: true,
      kycStatus: true,
      sellerLevel: true,
      createdAt: true,
      user: { select: { image: true } },
    },
  });
  if (!p) return null;
  return {
    id: p.id,
    userId: p.userId,
    displayName: p.displayName,
    bio: p.bio,
    country: p.country,
    image: p.user.image,
    trustScore: p.trustScore,
    ratingAvg: p.ratingAvg,
    ratingCount: p.ratingCount,
    totalSales: p.totalSales,
    kycVerified: p.kycStatus === "APPROVED",
    sellerLevel: p.sellerLevel,
    memberSince: p.createdAt,
  };
}

/** A seller's ACTIVE listings for their public profile (reuses the card mapper). */
export async function getSellerActiveListings(
  sellerId: string,
  limit = 12,
): Promise<ListingCardData[]> {
  const rows = await db.listing.findMany({
    where: { sellerId, status: "ACTIVE" },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: listingCardInclude,
  });
  return rows.map(toListingCardData);
}

// --- seller response stats (Prompt 04) --------------------------------------

export type SellerResponseStats = {
  /** Null when fewer than 3 measurable conversations (not enough signal). */
  avgFirstReplyMinutes: number | null;
  /** Conversations that contributed a buyer→seller reply time. */
  conversationCount: number;
};

const RESPONSE_MIN_SAMPLE = 3;

/**
 * Average minutes between a buyer's first message and the seller's first reply,
 * across the seller's last 20 conversations. Computed from `Message.createdAt`
 * (no stored field, no migration); returns null below a 3-conversation sample so
 * the UI stays honest for new sellers. Public seller signal — keyed by sellerId
 * only (never a caller userId), returns only aggregates (no message content).
 * `cache()`-wrapped so the listing page + seller profile dedup within a render.
 */
export const getSellerResponseStats = cache(
  async (sellerId: string): Promise<SellerResponseStats> => {
    const profile = await db.sellerProfile.findUnique({
      where: { id: sellerId },
      select: { userId: true },
    });
    if (!profile) return { avgFirstReplyMinutes: null, conversationCount: 0 };

    const conversations = await db.conversation.findMany({
      where: { sellerId },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        messages: {
          orderBy: { createdAt: "asc" },
          take: 10,
          select: { senderId: true, createdAt: true },
        },
      },
    });

    const replyMinutes: number[] = [];
    for (const convo of conversations) {
      const firstBuyer = convo.messages.find((m) => m.senderId !== profile.userId);
      if (!firstBuyer) continue;
      const firstReply = convo.messages.find(
        (m) => m.senderId === profile.userId && m.createdAt > firstBuyer.createdAt,
      );
      if (!firstReply) continue;
      replyMinutes.push(
        (firstReply.createdAt.getTime() - firstBuyer.createdAt.getTime()) / 60000,
      );
    }

    const conversationCount = replyMinutes.length;
    if (conversationCount < RESPONSE_MIN_SAMPLE) {
      return { avgFirstReplyMinutes: null, conversationCount };
    }
    const avg = replyMinutes.reduce((a, b) => a + b, 0) / conversationCount;
    return { avgFirstReplyMinutes: Math.round(avg), conversationCount };
  },
);
