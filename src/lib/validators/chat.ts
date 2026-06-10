import { z } from "zod";

/**
 * Chat input schemas (Step 11). ONE schema per shape, re-validated on the server
 * (server action, internal API route, and the persist service). Bodies are
 * trimmed + length-bounded; ids are shape-checked (existence/ownership are
 * enforced against the DB in the service).
 */

export const MAX_MESSAGE_CHARS = 2000;

const id = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9]+$/i, "Invalid id");

export const messageBodySchema = z
  .string()
  .trim()
  .min(1, "Message can't be empty.")
  .max(MAX_MESSAGE_CHARS, `Message is too long (max ${MAX_MESSAGE_CHARS} characters).`);

export const conversationIdSchema = id;

/** Open a conversation from EITHER a listing (seller) OR an order (exactly one). */
export const openConversationSchema = z
  .object({
    sellerProfileId: id.optional(),
    orderId: id.optional(),
  })
  .refine((v) => Boolean(v.sellerProfileId) !== Boolean(v.orderId), {
    message: "Provide exactly one of sellerProfileId or orderId.",
  });

// --- internal API payloads (Socket.io server → Next) ------------------------

export const internalAuthorizeSchema = z.object({
  userId: id,
  conversationId: id,
});

export const internalMessageSchema = z.object({
  userId: id,
  conversationId: id,
  body: messageBodySchema,
});

export const internalReadSchema = z.object({
  userId: id,
  conversationId: id,
});

export type OpenConversationInput = z.input<typeof openConversationSchema>;
