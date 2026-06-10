"use server";

import { auth } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import {
  conversationIdSchema,
  openConversationSchema,
} from "@/lib/validators/chat";
import {
  type ChatMessage,
  ChatServiceError,
  getMessages,
  getOrCreateConversation,
} from "@/server/services/chat";

/**
 * Chat server action (Step 11) — opens/finds a conversation from a listing
 * ("Chat with seller") or an order ("Chat about this order"). Sending messages
 * happens over the socket, not here; this only resolves the conversation id the
 * client then navigates to. Standard shape: auth → per-user rate limit → Zod.
 */

export type OpenConversationResult =
  | { ok: true; conversationId: string }
  | { ok: false; error: string };

export async function openConversationAction(
  raw: unknown,
): Promise<OpenConversationResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false, error: "Please log in to start a chat." };
  }
  const userId = session.user.id;

  const rl = rateLimit(`chat-open:${userId}`, { limit: 20, windowMs: 60_000 });
  if (!rl.ok) {
    return { ok: false, error: `Too many requests. Try again in ${rl.retryAfterSec}s.` };
  }

  const parsed = openConversationSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid request." };
  }

  try {
    const convo = await getOrCreateConversation(userId, parsed.data);
    return { ok: true, conversationId: convo.id };
  } catch (err) {
    if (err instanceof ChatServiceError) return { ok: false, error: err.message };
    console.error("[openConversationAction]", err);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}

export type LoadMessagesResult =
  | { ok: true; messages: ChatMessage[]; nextCursor: string | null }
  | { ok: false; error: string };

/**
 * Fetch a page of history (ownership-checked) — used by the chat client to load
 * older messages on scroll-up AND to backfill anything missed after a reconnect.
 */
export async function loadMessagesAction(
  rawConversationId: unknown,
  rawCursor?: unknown,
): Promise<LoadMessagesResult> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "Please log in." };
  const userId = session.user.id;

  const rl = rateLimit(`chat-load:${userId}`, { limit: 60, windowMs: 60_000 });
  if (!rl.ok) {
    return { ok: false, error: `Too many requests. Try again in ${rl.retryAfterSec}s.` };
  }

  const id = conversationIdSchema.safeParse(rawConversationId);
  if (!id.success) return { ok: false, error: "Invalid conversation." };
  const cursor =
    typeof rawCursor === "string" && conversationIdSchema.safeParse(rawCursor).success
      ? rawCursor
      : undefined;

  const page = await getMessages(userId, id.data, { cursor });
  if (!page) return { ok: false, error: "Conversation not found." };
  return { ok: true, messages: page.messages, nextCursor: page.nextCursor };
}
