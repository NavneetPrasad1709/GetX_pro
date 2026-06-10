import { z } from "zod";

/** Admin action input schemas (Step 15). Every admin action is ADMIN-gated + audited. */

const id = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9]+$/i, "Invalid id");

const note = z.string().trim().max(500).optional();

export const banUserSchema = z.object({ userId: id, banned: z.boolean() });

export const setRoleSchema = z.object({
  userId: id,
  role: z.enum(["BUYER", "ADMIN"]),
});

export const removeListingSchema = z.object({ listingId: id });

export const reviewKycSchema = z.object({
  submissionId: id,
  decision: z.enum(["APPROVE", "REJECT"]),
  note,
});

export const kycUrlSchema = z.object({ submissionId: id });

export const resolveDisputeSchema = z.object({
  orderId: id,
  outcome: z.enum(["REFUND_BUYER", "RELEASE_SELLER"]),
  note: z
    .string()
    .trim()
    .min(1, "Add a short resolution note")
    .max(500, "Keep the note under 500 characters"),
});

export const overrideTrustScoreSchema = z.object({
  sellerId: id,
  trustScore: z.number().int().min(0).max(100),
  sellerLevel: z.enum(["BRONZE", "SILVER", "GOLD", "PLATINUM", "ELITE"]),
  note,
});
