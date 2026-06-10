import { Prisma } from "@prisma/client";
import { captureException } from "@sentry/nextjs";
import { db } from "@/lib/db";
import { notifyNewMessage } from "@/server/services/notifications";

/**
 * Chat service (Step 11) — conversations + messages. SERVER-SIDE ONLY; the
 * single source of truth for membership rules and persistence. The Socket.io
 * server holds NO rules — it calls the internal API, which calls this service.
 *
 * A conversation is between a buyer (`buyerId` → User) and a seller
 * (`sellerId` → SellerProfile), optionally tied to one `orderId` (unique).
 * Membership in USER terms = `userId === buyerId || userId === seller.user.id`.
 */

export class ChatServiceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ChatServiceError";
  }
}

const DEFAULT_PAGE = 40;
const MAX_PAGE = 80;

export type ChatMessage = {
  id: string;
  conversationId: string;
  senderId: string;
  body: string;
  createdAt: string; // ISO — safe across RSC→client + the socket wire
  senderName: string | null;
  senderImage: string | null;
};

const messageSelect = {
  id: true,
  conversationId: true,
  senderId: true,
  body: true,
  createdAt: true,
  sender: { select: { name: true, image: true } },
} satisfies Prisma.MessageSelect;

type MessageRow = Prisma.MessageGetPayload<{ select: typeof messageSelect }>;

function toMessage(row: MessageRow): ChatMessage {
  return {
    id: row.id,
    conversationId: row.conversationId,
    senderId: row.senderId,
    body: row.body,
    createdAt: row.createdAt.toISOString(),
    senderName: row.sender.name,
    senderImage: row.sender.image,
  };
}

// --- membership -------------------------------------------------------------

const membershipSelect = {
  id: true,
  buyerId: true,
  sellerId: true,
  orderId: true,
  seller: { select: { userId: true } },
} satisfies Prisma.ConversationSelect;

/** Returns true iff `userId` is the buyer or the seller of the conversation. */
export async function isParticipant(
  userId: string,
  conversationId: string,
): Promise<boolean> {
  const c = await db.conversation.findUnique({
    where: { id: conversationId },
    select: membershipSelect,
  });
  return Boolean(c) && (c!.buyerId === userId || c!.seller.userId === userId);
}

// --- open / find a conversation ---------------------------------------------

/**
 * Get-or-create the conversation for either a listing's seller (a general DM
 * thread, one per buyer↔seller pair) OR an order (one per order, tied by the
 * unique orderId). Re-checks that the caller is allowed to start it.
 */
export async function getOrCreateConversation(
  userId: string,
  input: { sellerProfileId?: string; orderId?: string },
): Promise<{ id: string }> {
  if (input.orderId) {
    const order = await db.order.findUnique({
      where: { id: input.orderId },
      select: {
        id: true,
        buyerId: true,
        sellerId: true,
        seller: { select: { userId: true } },
      },
    });
    // Not a party to the order → same answer as not found (no enumeration).
    if (!order || (order.buyerId !== userId && order.seller.userId !== userId)) {
      throw new ChatServiceError("Order not found.");
    }
    const existing = await db.conversation.findUnique({
      where: { orderId: order.id },
      select: { id: true },
    });
    if (existing) return existing;
    try {
      return await db.conversation.create({
        data: { orderId: order.id, buyerId: order.buyerId, sellerId: order.sellerId },
        select: { id: true },
      });
    } catch (err) {
      // Lost a create race on the unique orderId → return the winner's row.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        return db.conversation.findUniqueOrThrow({
          where: { orderId: order.id },
          select: { id: true },
        });
      }
      throw err;
    }
  }

  if (input.sellerProfileId) {
    const seller = await db.sellerProfile.findUnique({
      where: { id: input.sellerProfileId },
      select: { id: true, userId: true },
    });
    if (!seller) throw new ChatServiceError("Seller not found.");
    if (seller.userId === userId) {
      throw new ChatServiceError("You can't start a chat with yourself.");
    }
    const existing = await db.conversation.findFirst({
      where: { buyerId: userId, sellerId: seller.id, orderId: null },
      select: { id: true },
    });
    if (existing) return existing;
    return db.conversation.create({
      data: { buyerId: userId, sellerId: seller.id },
      select: { id: true },
    });
  }

  throw new ChatServiceError("Invalid request.");
}

// --- conversation header (for the conversation page) ------------------------

export type ConversationHeader = {
  id: string;
  orderId: string | null;
  otherName: string;
  otherImage: string | null;
};

/** The conversation's "other party" for the header — null if not a member (404). */
export async function getConversationForUser(
  userId: string,
  conversationId: string,
): Promise<ConversationHeader | null> {
  const c = await db.conversation.findUnique({
    where: { id: conversationId },
    select: {
      id: true,
      orderId: true,
      buyerId: true,
      buyer: { select: { name: true, image: true } },
      seller: {
        select: {
          userId: true,
          displayName: true,
          user: { select: { image: true } },
        },
      },
    },
  });
  if (!c) return null;
  const isBuyer = c.buyerId === userId;
  const isSeller = c.seller.userId === userId;
  if (!isBuyer && !isSeller) return null;

  return {
    id: c.id,
    orderId: c.orderId,
    otherName: isBuyer ? c.seller.displayName : (c.buyer.name ?? "Buyer"),
    otherImage: isBuyer ? c.seller.user.image : c.buyer.image,
  };
}

// --- message history (paginated, ownership-checked) -------------------------

export type MessagePage = { messages: ChatMessage[]; nextCursor: string | null };

/**
 * Latest-first page of a conversation's history, returned oldest→newest for
 * display. `cursor` = the id of the oldest message already loaded (load-older).
 * Returns null when the caller isn't a member (page 404s).
 */
export async function getMessages(
  userId: string,
  conversationId: string,
  opts: { cursor?: string; limit?: number } = {},
): Promise<MessagePage | null> {
  if (!(await isParticipant(userId, conversationId))) return null;

  const take = Math.min(Math.max(1, opts.limit ?? DEFAULT_PAGE), MAX_PAGE);
  const rows = await db.message.findMany({
    where: { conversationId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: take + 1,
    ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
    select: messageSelect,
  });

  const hasMore = rows.length > take;
  const page = hasMore ? rows.slice(0, take) : rows;
  const nextCursor = hasMore ? page[page.length - 1].id : null;
  // page is newest→oldest; reverse to oldest→newest for the chat view.
  return { messages: page.reverse().map(toMessage), nextCursor };
}

// --- persist a message (called by the internal API on socket send) ----------

/**
 * Persist a message after re-verifying the sender is a member. Returns the saved
 * message so the socket server can broadcast the authoritative row (with id +
 * server timestamp) to the room.
 */
export async function persistMessage(
  userId: string,
  conversationId: string,
  body: string,
): Promise<ChatMessage> {
  if (!(await isParticipant(userId, conversationId))) {
    throw new ChatServiceError("You are not part of this conversation.");
  }
  const row = await db.message.create({
    data: { conversationId, senderId: userId, body },
    select: messageSelect,
  });
  const message = toMessage(row);
  // Notify the OTHER party (never the sender), fire-and-forget — must not slow or
  // fail the send/broadcast path (Step 22).
  void notifyMessageRecipient(
    userId,
    conversationId,
    message.senderName ?? "Someone",
  ).catch(captureException);
  return message;
}

/** Resolve the recipient (the non-sender member) and fire a new-message notification. */
async function notifyMessageRecipient(
  senderId: string,
  conversationId: string,
  senderName: string,
): Promise<void> {
  const convo = await db.conversation.findUnique({
    where: { id: conversationId },
    select: { buyerId: true, seller: { select: { userId: true } } },
  });
  if (!convo) return;
  const recipientUserId =
    senderId === convo.buyerId ? convo.seller.userId : convo.buyerId;
  // Guard against self-notify (e.g. a seller messaging on their own listing edge case).
  if (!recipientUserId || recipientUserId === senderId) return;
  await notifyNewMessage(recipientUserId, senderName, conversationId);
}

/** Mark the OTHER party's unread messages as read; returns how many. */
export async function markRead(
  userId: string,
  conversationId: string,
): Promise<number> {
  if (!(await isParticipant(userId, conversationId))) {
    throw new ChatServiceError("You are not part of this conversation.");
  }
  const res = await db.message.updateMany({
    where: { conversationId, readAt: null, NOT: { senderId: userId } },
    data: { readAt: new Date() },
  });
  return res.count;
}

// --- conversation list + unread badge ---------------------------------------

export type ConversationListItem = {
  id: string;
  orderId: string | null;
  otherName: string;
  otherImage: string | null;
  lastMessage: string | null;
  lastMessageAt: string | null; // ISO
  unreadCount: number;
};

/** Resolve the user's SellerProfile id once (they may be a seller too). */
async function sellerProfileIdFor(userId: string): Promise<string | null> {
  const p = await db.sellerProfile.findUnique({
    where: { userId },
    select: { id: true },
  });
  return p?.id ?? null;
}

/** "Where I'm a participant" filter — buyer in some convos, seller in others. */
function participantWhere(
  userId: string,
  sellerId: string | null,
): Prisma.ConversationWhereInput {
  return {
    OR: [{ buyerId: userId }, ...(sellerId ? [{ sellerId }] : [])],
  };
}

/** All the user's conversations, most-recent-activity first, with unread counts. */
export async function listConversations(
  userId: string,
): Promise<ConversationListItem[]> {
  const sellerId = await sellerProfileIdFor(userId);

  const convos = await db.conversation.findMany({
    where: participantWhere(userId, sellerId),
    select: {
      id: true,
      orderId: true,
      createdAt: true,
      buyerId: true,
      buyer: { select: { name: true, image: true } },
      seller: {
        select: { userId: true, displayName: true, user: { select: { image: true } } },
      },
      messages: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { body: true, createdAt: true },
      },
    },
  });
  if (convos.length === 0) return [];

  // Unread = the other party's unread messages, grouped per conversation.
  const unread = await db.message.groupBy({
    by: ["conversationId"],
    where: {
      conversationId: { in: convos.map((c) => c.id) },
      readAt: null,
      NOT: { senderId: userId },
    },
    _count: { _all: true },
  });
  const unreadByConvo = new Map(unread.map((u) => [u.conversationId, u._count._all]));

  // Most-recent-activity first (last message time, else conversation creation).
  const activityAt = (c: (typeof convos)[number]) =>
    (c.messages[0]?.createdAt ?? c.createdAt).getTime();

  return convos
    .slice()
    .sort((a, b) => activityAt(b) - activityAt(a))
    .map((c) => {
      const isBuyer = c.buyerId === userId;
      const last = c.messages[0] ?? null;
      return {
        id: c.id,
        orderId: c.orderId,
        otherName: isBuyer ? c.seller.displayName : (c.buyer.name ?? "Buyer"),
        otherImage: isBuyer ? c.seller.user.image : c.buyer.image,
        lastMessage: last?.body ?? null,
        lastMessageAt: (last?.createdAt ?? c.createdAt).toISOString(),
        unreadCount: unreadByConvo.get(c.id) ?? 0,
      };
    });
}

/** Total unread across all the user's conversations — for the header badge. */
export async function countUnread(userId: string): Promise<number> {
  const sellerId = await sellerProfileIdFor(userId);
  return db.message.count({
    where: {
      readAt: null,
      NOT: { senderId: userId },
      conversation: participantWhere(userId, sellerId),
    },
  });
}
