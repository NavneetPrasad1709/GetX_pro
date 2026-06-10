import { z } from "zod";

/**
 * Review input schemas (Step 13). One schema per action, re-validated on the
 * server. Eligibility (must own a COMPLETED order) + one-per-order + profanity
 * are enforced in the service — the schema only shape-checks.
 */

export const MAX_REVIEW_COMMENT = 1000;
export const MAX_SELLER_REPLY = 1000;

const id = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9]+$/i, "Invalid id");

const ratingField = z.coerce
  .number()
  .int("Pick a star rating")
  .min(1, "Pick between 1 and 5 stars")
  .max(5, "Pick between 1 and 5 stars");

const commentField = z
  .string()
  .trim()
  .max(MAX_REVIEW_COMMENT, `Keep your review under ${MAX_REVIEW_COMMENT} characters`)
  .optional()
  .or(z.literal(""));

export const submitReviewSchema = z.object({
  orderId: id,
  rating: ratingField,
  comment: commentField,
});

export const editReviewSchema = z.object({
  reviewId: id,
  rating: ratingField,
  comment: commentField,
});

export const replyReviewSchema = z.object({
  reviewId: id,
  reply: z
    .string()
    .trim()
    .min(1, "Write a reply")
    .max(MAX_SELLER_REPLY, `Keep your reply under ${MAX_SELLER_REPLY} characters`),
});

export type SubmitReviewInput = z.input<typeof submitReviewSchema>;
export type EditReviewInput = z.input<typeof editReviewSchema>;
