import {
  TicketType,
  TicketPriority,
  type TicketStatus,
  type WorkTicket,
  type TicketNote,
} from "@prisma/client";
import { db } from "@/lib/db";
import { siteConfig } from "@/config/site";

/**
 * Operations work-queue (Prompt 24) — SERVER-SIDE ONLY, ADMIN-gated callers.
 *
 * A unified, SLA-tracked ticket over disputes / KYC / fraud / payouts so ops can run a
 * prioritized queue with first-response + resolution SLAs and breach escalation, instead of
 * one human scrolling flat lists. This service ONLY manages ticket lifecycle + SLA — every
 * money mutation stays in the escrow/payout services. Ticket creation from the source flows is
 * fire-and-forget (a queue failure must never block a dispute/KYC/payout).
 */

const { slaHours, queuePageSize } = siteConfig.ops;
const OPEN_STATUSES: TicketStatus[] = ["OPEN", "IN_PROGRESS", "PENDING_INFO"];

/** Resolution deadline for a ticket type = createdAt + the configured SLA hours. */
export function computeSlaDeadline(type: TicketType, createdAt: Date = new Date()): Date {
  const hours = slaHours[type] ?? 24;
  return new Date(createdAt.getTime() + hours * 60 * 60 * 1000);
}

// --- lifecycle --------------------------------------------------------------

/**
 * Create a ticket, idempotently: if an unresolved ticket already exists for this
 * entity, return it (so a retried dispute/KYC hook never opens duplicates).
 */
export async function createTicket(args: {
  type: TicketType;
  priority: TicketPriority;
  entityType: string;
  entityId: string;
  title: string;
  createdById?: string | null;
}): Promise<WorkTicket> {
  const existing = await db.workTicket.findFirst({
    where: { entityType: args.entityType, entityId: args.entityId, status: { in: OPEN_STATUSES } },
  });
  if (existing) return existing;

  return db.workTicket.create({
    data: {
      type: args.type,
      priority: args.priority,
      status: "OPEN",
      title: args.title.slice(0, 160),
      entityType: args.entityType,
      entityId: args.entityId,
      createdById: args.createdById ?? null,
      slaDeadlineAt: computeSlaDeadline(args.type),
    },
  });
}

export async function assignTicket(
  actorId: string,
  ticketId: string,
  assigneeId: string,
): Promise<void> {
  await db.$transaction([
    // OPEN → IN_PROGRESS (only if still OPEN; a PENDING_INFO ticket keeps its status).
    db.workTicket.updateMany({
      where: { id: ticketId, status: "OPEN" },
      data: { status: "IN_PROGRESS" },
    }),
    db.workTicket.update({
      where: { id: ticketId },
      data: { assignedToId: assigneeId },
    }),
    db.auditLog.create({
      data: { actorId, action: "TICKET_ASSIGNED", entity: "WorkTicket", entityId: ticketId, meta: { assigneeId } },
    }),
  ]);
  // First agent touch sets firstResponseAt (only if not already set).
  await db.workTicket.updateMany({
    where: { id: ticketId, firstResponseAt: null },
    data: { firstResponseAt: new Date() },
  });
}

export async function addNote(
  actorId: string,
  ticketId: string,
  body: string,
  internal = true,
): Promise<TicketNote> {
  const note = await db.ticketNote.create({
    data: { ticketId, authorId: actorId, body: body.slice(0, 2000), internal },
  });
  // First agent touch sets firstResponseAt.
  await db.workTicket.updateMany({
    where: { id: ticketId, firstResponseAt: null },
    data: { firstResponseAt: new Date() },
  });
  await db.auditLog.create({
    data: { actorId, action: "TICKET_NOTE_ADDED", entity: "WorkTicket", entityId: ticketId },
  });
  return note;
}

export async function closeTicket(
  actorId: string,
  ticketId: string,
  resolution: string,
): Promise<void> {
  const now = new Date();
  await db.ticketNote.create({
    data: { ticketId, authorId: actorId, body: `Resolution: ${resolution}`.slice(0, 2000) },
  });
  await db.workTicket.update({
    where: { id: ticketId },
    data: { status: "CLOSED", closedAt: now, resolvedAt: now },
  });
  await db.workTicket.updateMany({
    where: { id: ticketId, firstResponseAt: null },
    data: { firstResponseAt: now },
  });
  await db.auditLog.create({
    data: { actorId, action: "TICKET_CLOSED", entity: "WorkTicket", entityId: ticketId, meta: { resolution } },
  });
}

// --- source-flow convenience creators (fire-and-forget from existing services) ---

/** Open a DISPUTE ticket for an order (priority by order value). Idempotent via createTicket. */
export async function ticketForDispute(orderId: string, openedById?: string): Promise<void> {
  const order = await db.order.findUnique({
    where: { id: orderId },
    select: { totalMinor: true, listing: { select: { title: true } } },
  });
  if (!order) return;
  const priority: TicketPriority =
    order.totalMinor >= siteConfig.ops.highValueDisputeMinor ? "HIGH" : "NORMAL";
  await createTicket({
    type: "DISPUTE",
    priority,
    entityType: "Order",
    entityId: orderId,
    title: `Dispute — ${order.listing.title}`,
    createdById: openedById,
  });
}

/** Open a KYC review ticket for a submission. Idempotent via createTicket. */
export async function ticketForKyc(submissionId: string, sellerUserId?: string): Promise<void> {
  const sub = await db.kycSubmission.findUnique({
    where: { id: submissionId },
    select: { seller: { select: { displayName: true } } },
  });
  if (!sub) return;
  await createTicket({
    type: "KYC",
    priority: "NORMAL",
    entityType: "KycSubmission",
    entityId: submissionId,
    title: `KYC review — ${sub.seller.displayName}`,
    createdById: sellerUserId,
  });
}

// --- queue ------------------------------------------------------------------

export type WorkTicketRow = {
  id: string;
  type: TicketType;
  priority: TicketPriority;
  status: TicketStatus;
  title: string;
  entityType: string;
  entityId: string;
  assignedToName: string | null;
  slaDeadlineAt: string; // ISO
  slaBreached: boolean;
  firstResponseAt: string | null;
  createdAt: string;
};

/** Prioritized open queue: CRITICAL → HIGH → NORMAL → LOW, then most-urgent SLA first. */
export async function listOpenTickets(opts: {
  type?: TicketType;
  assignedToId?: string | null;
  priority?: TicketPriority;
  limit?: number;
} = {}): Promise<WorkTicketRow[]> {
  const now = new Date();
  const rows = await db.workTicket.findMany({
    where: {
      status: { in: OPEN_STATUSES },
      ...(opts.type ? { type: opts.type } : {}),
      ...(opts.priority ? { priority: opts.priority } : {}),
      ...(opts.assignedToId === null
        ? { assignedToId: null }
        : opts.assignedToId
          ? { assignedToId: opts.assignedToId }
          : {}),
    },
    orderBy: [{ priority: "desc" }, { slaDeadlineAt: "asc" }],
    take: Math.min(Math.max(1, opts.limit ?? queuePageSize), 100),
    include: { assignedTo: { select: { name: true, email: true } } },
  });
  return rows.map((r) => ({
    id: r.id,
    type: r.type,
    priority: r.priority,
    status: r.status,
    title: r.title,
    entityType: r.entityType,
    entityId: r.entityId,
    assignedToName: r.assignedTo ? (r.assignedTo.name ?? r.assignedTo.email) : null,
    slaDeadlineAt: r.slaDeadlineAt.toISOString(),
    slaBreached: r.slaDeadlineAt < now,
    firstResponseAt: r.firstResponseAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
  }));
}

// --- metrics ----------------------------------------------------------------

export type OpsMetrics = {
  queueDepth: Record<TicketType, number>;
  slaAttainmentPct: number;
  medianResolutionHours: number;
  autoResolutionPct: number;
  breachedOpen: number;
  agentLoad: { agentId: string; agentName: string; openCount: number }[];
  highPriorityOpen: number;
};

export async function getOpsMetrics(): Promise<OpsMetrics> {
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const [depthRows, resolved, breachedOpen, highPriorityOpen, loadRows, medianRows] =
    await Promise.all([
      db.workTicket.groupBy({
        by: ["type"],
        where: { status: { in: OPEN_STATUSES } },
        _count: { _all: true },
      }),
      db.workTicket.findMany({
        where: { resolvedAt: { not: null, gte: weekAgo } },
        select: {
          resolvedAt: true,
          slaDeadlineAt: true,
          _count: { select: { notes: true } },
        },
      }),
      db.workTicket.count({
        where: { status: { in: OPEN_STATUSES }, slaDeadlineAt: { lt: now } },
      }),
      db.workTicket.count({
        where: { status: { in: OPEN_STATUSES }, priority: { in: ["HIGH", "CRITICAL"] } },
      }),
      db.workTicket.groupBy({
        by: ["assignedToId"],
        where: { status: { in: OPEN_STATUSES }, assignedToId: { not: null } },
        _count: { _all: true },
        orderBy: { _count: { assignedToId: "desc" } },
        take: 10,
      }),
      db.$queryRaw<{ median: number | null }[]>`
        SELECT PERCENTILE_CONT(0.5) WITHIN GROUP (
          ORDER BY EXTRACT(EPOCH FROM ("resolvedAt" - "createdAt")) / 3600
        ) AS median
        FROM "WorkTicket"
        WHERE "resolvedAt" IS NOT NULL AND "resolvedAt" >= ${weekAgo}`,
    ]);

  // queueDepth — zero-filled for every type.
  const queueDepth = Object.values(TicketType).reduce(
    (acc, t) => ({ ...acc, [t]: 0 }),
    {} as Record<TicketType, number>,
  );
  for (const row of depthRows) queueDepth[row.type] = row._count._all;

  const attained = resolved.filter((r) => r.resolvedAt && r.resolvedAt <= r.slaDeadlineAt).length;
  const autoResolved = resolved.filter((r) => r._count.notes === 0).length;
  const pct = (num: number, den: number) =>
    den > 0 ? Math.round((num / den) * 1000) / 10 : 0;

  // Resolve agent names for the load board.
  const agentIds = loadRows.map((l) => l.assignedToId).filter((id): id is string => id !== null);
  const agents = agentIds.length
    ? await db.user.findMany({ where: { id: { in: agentIds } }, select: { id: true, name: true, email: true } })
    : [];
  const nameOf = (id: string) => {
    const a = agents.find((x) => x.id === id);
    return a ? (a.name ?? a.email) : "Unknown";
  };

  return {
    queueDepth,
    slaAttainmentPct: pct(attained, resolved.length),
    medianResolutionHours: Math.round((medianRows[0]?.median ?? 0) * 10) / 10,
    autoResolutionPct: pct(autoResolved, resolved.length),
    breachedOpen,
    agentLoad: loadRows
      .filter((l) => l.assignedToId !== null)
      .map((l) => ({
        agentId: l.assignedToId as string,
        agentName: nameOf(l.assignedToId as string),
        openCount: l._count._all,
      })),
    highPriorityOpen,
  };
}

// --- SLA breach sweep (Vercel Cron) -----------------------------------------

export type SlaSweepSummary = { scanned: number; escalated: number };

/**
 * Escalate open tickets past their SLA deadline to CRITICAL and audit-log the breach.
 * Idempotent: a ticket bumped to CRITICAL is excluded next sweep, so it's logged once.
 */
export async function sweepSlaBreaches(now: Date = new Date()): Promise<SlaSweepSummary> {
  const breached = await db.workTicket.findMany({
    where: {
      status: { in: OPEN_STATUSES },
      slaDeadlineAt: { lt: now },
      priority: { not: "CRITICAL" },
    },
    select: { id: true },
    take: 500,
  });

  let escalated = 0;
  for (const { id } of breached) {
    try {
      await db.$transaction([
        db.workTicket.update({ where: { id }, data: { priority: "CRITICAL" } }),
        db.auditLog.create({
          data: { actorId: null, action: "SLA_BREACHED", entity: "WorkTicket", entityId: id },
        }),
      ]);
      escalated += 1;
    } catch {
      /* one failure shouldn't stop the sweep */
    }
  }
  return { scanned: breached.length, escalated };
}
