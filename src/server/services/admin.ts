import { Prisma, type OrderStatus, type Role } from "@prisma/client";
import { db } from "@/lib/db";
import { invalidateUserSessions } from "@/server/services/sessions";

/**
 * Admin service (Step 15) — the control room reads + moderation. SERVER-SIDE
 * ONLY; every page/action that uses this is ADMIN-gated (layout + action check).
 * Every mutation writes an AuditLog. Money decisions (dispute resolve, payouts)
 * live in the escrow/payout services; this handles users, listings, orders and
 * the dispute/KYC queues' read side.
 */

export class AdminServiceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AdminServiceError";
  }
}

// --- dashboard --------------------------------------------------------------

export type AdminDashboard = {
  users: number;
  sellers: number;
  activeListings: number;
  orders: number;
  gmvMinor: number;
  openDisputes: number;
  pendingKyc: number;
  pendingPayouts: number;
};

export async function getAdminDashboard(): Promise<AdminDashboard> {
  const [users, sellers, activeListings, orders, gmv, openDisputes, pendingKyc, pendingPayouts] =
    await Promise.all([
      db.user.count(),
      db.sellerProfile.count(),
      db.listing.count({ where: { status: "ACTIVE" } }),
      db.order.count(),
      db.order.aggregate({ where: { status: "COMPLETED" }, _sum: { totalMinor: true } }),
      db.dispute.count({ where: { status: "OPEN" } }),
      db.kycSubmission.count({ where: { status: "PENDING" } }),
      db.payout.count({ where: { status: { in: ["REQUESTED", "PROCESSING"] } } }),
    ]);
  return {
    users,
    sellers,
    activeListings,
    orders,
    gmvMinor: gmv._sum.totalMinor ?? 0,
    openDisputes,
    pendingKyc,
    pendingPayouts,
  };
}

// --- users ------------------------------------------------------------------

export type AdminUserRow = {
  id: string;
  name: string | null;
  email: string;
  role: Role;
  banned: boolean;
  isSeller: boolean;
  createdAt: string;
  sumsubApplicantId: string | null; // Step 29 — Sumsub Cockpit deep-link
  sumsubReviewedAt: string | null;
};

export async function listUsers(query?: string, limit = 30): Promise<AdminUserRow[]> {
  const q = query?.trim();
  const where: Prisma.UserWhereInput = q
    ? {
        OR: [
          { email: { contains: q, mode: "insensitive" } },
          { name: { contains: q, mode: "insensitive" } },
        ],
      }
    : {};
  const rows = await db.user.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: Math.min(Math.max(1, limit), 100),
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      bannedAt: true,
      createdAt: true,
      sellerProfile: { select: { id: true } },
      sumsubApplicantId: true,
      sumsubReviewedAt: true,
    },
  });
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    email: r.email,
    role: r.role,
    banned: r.bannedAt !== null,
    isSeller: r.sellerProfile !== null,
    createdAt: r.createdAt.toISOString(),
    sumsubApplicantId: r.sumsubApplicantId,
    sumsubReviewedAt: r.sumsubReviewedAt?.toISOString() ?? null,
  }));
}

/** Ban or un-ban a user. Can't ban yourself or another admin. Audit-logged. */
export async function setUserBanned(
  adminId: string,
  userId: string,
  banned: boolean,
): Promise<void> {
  if (adminId === userId) {
    throw new AdminServiceError("You can't ban your own account.");
  }
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true },
  });
  if (!user) throw new AdminServiceError("User not found.");
  if (banned && user.role === "ADMIN") {
    throw new AdminServiceError("You can't ban another admin.");
  }
  await db.$transaction([
    db.user.update({
      where: { id: userId },
      data: { bannedAt: banned ? new Date() : null },
    }),
    // Banning must also kill any live session immediately (Step 32). Unban
    // doesn't need it — those sessions are already dead and the user re-logs in.
    ...(banned ? [invalidateUserSessions(db, userId)] : []),
    db.auditLog.create({
      data: {
        actorId: adminId,
        action: banned ? "USER_BANNED" : "USER_UNBANNED",
        entity: "User",
        entityId: userId,
      },
    }),
  ]);
}

/** Promote/demote between BUYER and ADMIN. Can't change your own role. */
export async function setUserRole(
  adminId: string,
  userId: string,
  role: "BUYER" | "ADMIN",
): Promise<void> {
  if (adminId === userId) {
    throw new AdminServiceError("You can't change your own role.");
  }
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true },
  });
  if (!user) throw new AdminServiceError("User not found.");
  if (user.role === role) return;

  await db.$transaction([
    db.user.update({ where: { id: userId }, data: { role } }),
    // Force every existing token to re-mint with the new role (Step 32) —
    // a demoted admin loses access within ~60s instead of until token expiry.
    invalidateUserSessions(db, userId),
    db.auditLog.create({
      data: {
        actorId: adminId,
        action: "USER_ROLE_CHANGED",
        entity: "User",
        entityId: userId,
        meta: { from: user.role, to: role },
      },
    }),
  ]);
}

// --- listings ---------------------------------------------------------------

export type AdminListingRow = {
  id: string;
  title: string;
  slug: string;
  status: string;
  priceMinor: number;
  currency: string;
  sellerName: string;
  createdAt: string;
  /** active paid boost? (Prompt 15 — admin can force-clear) */
  isFeatured: boolean;
};

export async function listAdminListings(query?: string, limit = 30): Promise<AdminListingRow[]> {
  const q = query?.trim();
  const where: Prisma.ListingWhereInput = q
    ? {
        OR: [
          { title: { contains: q, mode: "insensitive" } },
          { slug: { contains: q, mode: "insensitive" } },
        ],
      }
    : {};
  const rows = await db.listing.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: Math.min(Math.max(1, limit), 100),
    select: {
      id: true,
      title: true,
      slug: true,
      status: true,
      priceMinor: true,
      currency: true,
      createdAt: true,
      isFeatured: true,
      boostExpiresAt: true,
      seller: { select: { displayName: true } },
    },
  });
  const now = new Date();
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    slug: r.slug,
    status: r.status,
    priceMinor: r.priceMinor,
    currency: r.currency,
    sellerName: r.seller.displayName,
    createdAt: r.createdAt.toISOString(),
    isFeatured:
      r.isFeatured && r.boostExpiresAt != null && r.boostExpiresAt > now,
  }));
}

/** Admin take-down of an abusive listing → REMOVED (soft delete). Audit-logged. */
export async function removeListingAsAdmin(adminId: string, listingId: string): Promise<void> {
  const listing = await db.listing.findUnique({
    where: { id: listingId },
    select: { id: true },
  });
  if (!listing) throw new AdminServiceError("Listing not found.");
  await db.$transaction([
    // Removal also clears any paid boost (Prompt 15).
    db.listing.update({
      where: { id: listingId },
      data: { status: "REMOVED", isFeatured: false, boostExpiresAt: null },
    }),
    db.auditLog.create({
      data: {
        actorId: adminId,
        action: "LISTING_REMOVED_BY_ADMIN",
        entity: "Listing",
        entityId: listingId,
      },
    }),
  ]);
}

// --- orders -----------------------------------------------------------------

export type AdminOrderRow = {
  id: string;
  status: OrderStatus;
  totalMinor: number;
  currency: string;
  createdAt: string;
  buyerEmail: string;
  sellerName: string;
  listingTitle: string;
};

export async function listAdminOrders(
  status?: OrderStatus,
  limit = 30,
): Promise<AdminOrderRow[]> {
  const rows = await db.order.findMany({
    where: status ? { status } : {},
    orderBy: { createdAt: "desc" },
    take: Math.min(Math.max(1, limit), 100),
    select: {
      id: true,
      status: true,
      totalMinor: true,
      currency: true,
      createdAt: true,
      buyer: { select: { email: true } },
      seller: { select: { displayName: true } },
      listing: { select: { title: true } },
    },
  });
  return rows.map((r) => ({
    id: r.id,
    status: r.status,
    totalMinor: r.totalMinor,
    currency: r.currency,
    createdAt: r.createdAt.toISOString(),
    buyerEmail: r.buyer.email,
    sellerName: r.seller.displayName,
    listingTitle: r.listing.title,
  }));
}

// --- disputes (queue + full context for resolution) -------------------------

export type DisputeQueueItem = {
  orderId: string;
  reason: string;
  openedByName: string;
  amountMinor: number;
  currency: string;
  listingTitle: string;
  createdAt: string;
};

export async function listOpenDisputes(): Promise<DisputeQueueItem[]> {
  const rows = await db.dispute.findMany({
    where: { status: "OPEN" },
    orderBy: { createdAt: "asc" },
    select: {
      orderId: true,
      reason: true,
      createdAt: true,
      openedBy: { select: { name: true } },
      order: {
        select: {
          totalMinor: true,
          currency: true,
          listing: { select: { title: true } },
        },
      },
    },
  });
  return rows.map((r) => ({
    orderId: r.orderId,
    reason: r.reason,
    openedByName: r.openedBy.name ?? "Buyer",
    amountMinor: r.order.totalMinor,
    currency: r.order.currency,
    listingTitle: r.order.listing.title,
    createdAt: r.createdAt.toISOString(),
  }));
}

export type DisputeMessage = {
  body: string;
  senderName: string;
  createdAt: string;
};

export type DisputeContext = {
  orderId: string;
  orderStatus: OrderStatus;
  totalMinor: number;
  currency: string;
  buyerName: string;
  sellerName: string;
  listingTitle: string;
  reason: string;
  disputeStatus: string;
  resolutionNote: string | null;
  deliveryContent: string | null;
  messages: DisputeMessage[];
};

/**
 * Everything an admin needs to decide a dispute: order summary, the seller's
 * delivery proof, the dispute reason, and the buyer↔seller chat. Admin is
 * privileged, so this reads directly (no participant check). Null if no dispute.
 */
export async function getDisputeContext(orderId: string): Promise<DisputeContext | null> {
  const order = await db.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      status: true,
      totalMinor: true,
      currency: true,
      buyer: { select: { name: true } },
      seller: { select: { displayName: true } },
      listing: { select: { title: true } },
      delivery: { select: { content: true } },
      dispute: { select: { reason: true, status: true, resolutionNote: true } },
      conversation: {
        select: {
          messages: {
            orderBy: { createdAt: "asc" },
            take: 100,
            select: {
              body: true,
              createdAt: true,
              sender: { select: { name: true } },
            },
          },
        },
      },
    },
  });
  if (!order || !order.dispute) return null;

  return {
    orderId: order.id,
    orderStatus: order.status,
    totalMinor: order.totalMinor,
    currency: order.currency,
    buyerName: order.buyer.name ?? "Buyer",
    sellerName: order.seller.displayName,
    listingTitle: order.listing.title,
    reason: order.dispute.reason,
    disputeStatus: order.dispute.status,
    resolutionNote: order.dispute.resolutionNote,
    deliveryContent: order.delivery?.content ?? null,
    messages: (order.conversation?.messages ?? []).map((m) => ({
      body: m.body,
      senderName: m.sender.name ?? "User",
      createdAt: m.createdAt.toISOString(),
    })),
  };
}
