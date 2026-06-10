import { Prisma, type SupportTicket, type SupportTicketStatus } from "@prisma/client";
import { captureException } from "@sentry/nextjs";
import { db } from "@/lib/db";
import { formatMoney } from "@/lib/money";

/**
 * AI Support bot service (Step 16). Three jobs:
 *   1. getSupportContext — server-verified per-user grounding (orders + disputes) for the prompt.
 *   2. createSupportTicket — persist an escalated chat for a human (idempotent per user+subject).
 *   3. closeSupportTicket — admin resolution (audit-logged, idempotent).
 *
 * The bot NEVER moves money or mutates orders — it only reads context and files tickets.
 */

export type SupportMessage = { role: "user" | "assistant"; content: string };

export class SupportServiceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SupportServiceError";
  }
}

// ---------------------------------------------------------------------------
// 1. Context injection — server-side only, never trusts the client.
// ---------------------------------------------------------------------------

/**
 * Compact, plain-text summary of the user's last 5 (non-draft) orders and any open
 * disputes, appended to the system prompt so the bot can answer "where is my order?".
 * Returns "" on any error — support must never break because context failed to load.
 */
export async function getSupportContext(userId: string): Promise<string> {
  try {
    const [orders, disputes] = await Promise.all([
      db.order.findMany({
        where: { buyerId: userId, status: { not: "DRAFT" } },
        orderBy: { createdAt: "desc" },
        take: 5,
        select: {
          id: true,
          status: true,
          totalMinor: true,
          currency: true,
          createdAt: true,
          listing: { select: { title: true } },
        },
      }),
      db.dispute.findMany({
        where: { openedById: userId, status: "OPEN" },
        orderBy: { createdAt: "desc" },
        take: 5,
        select: { id: true, status: true, orderId: true },
      }),
    ]);

    if (orders.length === 0 && disputes.length === 0) {
      return "This user has no orders yet.";
    }

    const lines: string[] = [];
    if (orders.length > 0) {
      lines.push("Recent orders (newest first):");
      for (const o of orders) {
        const placed = o.createdAt.toISOString().slice(0, 10);
        lines.push(
          `- Order ${o.id} · "${o.listing.title}" · status ${o.status} · ${formatMoney(o.totalMinor, o.currency)} · placed ${placed}`,
        );
      }
    }
    if (disputes.length > 0) {
      lines.push("Open disputes:");
      for (const d of disputes) {
        lines.push(`- Dispute ${d.id} on order ${d.orderId} · status ${d.status}`);
      }
    }
    return lines.join("\n");
  } catch (err) {
    captureException(err);
    return "";
  }
}

// ---------------------------------------------------------------------------
// 2. Escalation detection (pure, unit-testable — no AI / DB).
// ---------------------------------------------------------------------------

const HUMAN_REQUEST =
  /\b(human|agent|real person|talk to (a )?person|speak to (a )?person|escalate)\b/i;
const AI_UNSURE = [
  "i don't know",
  "i dont know",
  "i'm not sure",
  "i am not sure",
  "i cannot help",
  "i can't help",
  "i'm unable",
  "i am unable",
];

/**
 * Decide whether a conversation should be handed to a human: either the user explicitly
 * asked for one, or the assistant signalled low confidence with a known phrase.
 */
export function detectEscalation(lastUserMessage: string, aiResponse: string): boolean {
  if (HUMAN_REQUEST.test(lastUserMessage)) return true;
  const lower = aiResponse.toLowerCase();
  return AI_UNSURE.some((p) => lower.includes(p));
}

// ---------------------------------------------------------------------------
// 3. Ticket persistence.
// ---------------------------------------------------------------------------

function firstUserMessage(messages: SupportMessage[]): string | undefined {
  return messages.find((m) => m.role === "user")?.content;
}

function deriveSubject(messages: SupportMessage[], subject?: string): string {
  const raw = (subject ?? firstUserMessage(messages) ?? "Support request").trim();
  return raw.slice(0, 80) || "Support request";
}

/**
 * File a support ticket for an escalated chat. Idempotent for logged-in users: if an OPEN
 * ticket with the same subject already exists, refresh its transcript and return it instead
 * of creating a duplicate (a chat can trip the escalation check on several turns). Guests
 * (userId null) always get a fresh ticket — there's no stable key to dedupe on.
 */
export async function createSupportTicket(
  userId: string | null,
  messages: SupportMessage[],
  subject?: string,
): Promise<SupportTicket> {
  const subj = deriveSubject(messages, subject);
  const history = messages as unknown as Prisma.InputJsonValue;

  if (userId) {
    const existing = await db.supportTicket.findFirst({
      where: { userId, subject: subj, status: "OPEN" },
    });
    if (existing) {
      return db.supportTicket.update({
        where: { id: existing.id },
        data: { chatHistory: history },
      });
    }
  }

  return db.supportTicket.create({
    data: { userId: userId ?? null, subject: subj, chatHistory: history, status: "OPEN" },
  });
}

/**
 * Admin closes a ticket and (optionally) records a note. Idempotent — closing an
 * already-CLOSED ticket is a no-op and does NOT write a duplicate AuditLog. The
 * status check + write share one transaction so the audit row can't drift from state.
 */
export async function closeSupportTicket(
  adminId: string,
  ticketId: string,
  note?: string,
): Promise<void> {
  await db.$transaction(async (tx) => {
    const ticket = await tx.supportTicket.findUnique({
      where: { id: ticketId },
      select: { status: true },
    });
    if (!ticket) throw new SupportServiceError("Ticket not found.");
    if (ticket.status === "CLOSED") return; // already resolved — no dup audit

    await tx.supportTicket.update({
      where: { id: ticketId },
      data: { status: "CLOSED", adminNote: note?.slice(0, 2000) ?? null },
    });
    await tx.auditLog.create({
      data: {
        actorId: adminId,
        action: "CLOSE_SUPPORT_TICKET",
        entity: "SupportTicket",
        entityId: ticketId,
        meta: { note: note ?? null },
      },
    });
  });
}

// ---------------------------------------------------------------------------
// Admin read models.
// ---------------------------------------------------------------------------

export type SupportTicketListItem = {
  id: string;
  subject: string;
  status: SupportTicketStatus;
  userEmail: string | null;
  createdAt: Date;
};

export async function listSupportTickets(opts: {
  status?: SupportTicketStatus;
  limit?: number;
}): Promise<SupportTicketListItem[]> {
  const rows = await db.supportTicket.findMany({
    where: opts.status ? { status: opts.status } : {},
    orderBy: [{ status: "asc" }, { createdAt: "desc" }], // OPEN before CLOSED, newest first
    take: opts.limit ?? 50,
    select: {
      id: true,
      subject: true,
      status: true,
      createdAt: true,
      user: { select: { email: true } },
    },
  });
  return rows.map((r) => ({
    id: r.id,
    subject: r.subject,
    status: r.status,
    userEmail: r.user?.email ?? null,
    createdAt: r.createdAt,
  }));
}

export type SupportTicketDetail = {
  id: string;
  subject: string;
  status: SupportTicketStatus;
  adminNote: string | null;
  messages: SupportMessage[];
  userEmail: string | null;
  userName: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export async function getSupportTicket(id: string): Promise<SupportTicketDetail | null> {
  const t = await db.supportTicket.findUnique({
    where: { id },
    select: {
      id: true,
      subject: true,
      status: true,
      adminNote: true,
      chatHistory: true,
      createdAt: true,
      updatedAt: true,
      user: { select: { email: true, name: true } },
    },
  });
  if (!t) return null;
  return {
    id: t.id,
    subject: t.subject,
    status: t.status,
    adminNote: t.adminNote,
    messages: parseChatHistory(t.chatHistory),
    userEmail: t.user?.email ?? null,
    userName: t.user?.name ?? null,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
  };
}

/** Safely coerce a stored `chatHistory` JSON value back into typed messages. */
export function parseChatHistory(value: unknown): SupportMessage[] {
  if (!Array.isArray(value)) return [];
  const out: SupportMessage[] = [];
  for (const item of value) {
    if (item && typeof item === "object" && !Array.isArray(item)) {
      const rec = item as Record<string, unknown>;
      const role = rec.role;
      const content = rec.content;
      if ((role === "user" || role === "assistant") && typeof content === "string") {
        out.push({ role, content });
      }
    }
  }
  return out;
}
