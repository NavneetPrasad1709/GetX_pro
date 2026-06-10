import { z } from "zod";

/**
 * AI Support bot input schemas (Step 16). Validated on the server (client + server
 * share these). The chat schema is the security boundary for the streaming route:
 * it caps message length and history depth so a client can't blow up the context.
 */

const id = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9]+$/i, "Invalid id");

/** One conversation turn. `content` is hard-capped at 500 chars (also enforced client-side). */
export const supportTurnSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().trim().min(1, "Message cannot be empty").max(500, "Message too long"),
});

export type SupportTurnInput = z.infer<typeof supportTurnSchema>;

/** POST /api/support/chat body. History is capped at 20 turns. */
export const supportChatSchema = z.object({
  messages: z
    .array(supportTurnSchema)
    .min(1, "At least one message is required")
    .max(20, "Chat history is full"),
  orderId: id.optional(),
});

/** Admin "close ticket" Server Action input. */
export const closeTicketSchema = z.object({
  ticketId: id,
  note: z.string().trim().max(2000).optional(),
});
