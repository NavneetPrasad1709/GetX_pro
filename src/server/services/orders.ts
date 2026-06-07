import { Prisma, type Order, type OrderStatus, type Role } from "@prisma/client";
import { db } from "@/lib/db";
import { computeBuyerFee, computeSellerCommissionMinor } from "@/lib/fees";
import type { CreateOrderParsed } from "@/lib/validators/order";

/**
 * Order lifecycle (Step 08). SERVER-SIDE ONLY — called from server actions
 * after auth + Zod. Guardrails:
 *   §1 money: every amount recomputed from the DB listing in integer minor
 *      units; the client NEVER supplies a price/total.
 *   §3 state machine: orders move only along ORDER_TRANSITIONS; illegal jumps
 *      throw. Crypto needs awaiting_payment → underpaid/paid/expired.
 *   §5 all money mutations server-side, inside a DB transaction.
 *
 * Payment is Step 09 — here we create the order in AWAITING_PAYMENT. Stock is
 * VALIDATED here but only DECREMENTED when payment confirms (Step 09), so an
 * abandoned unpaid order never locks a one-of-a-kind listing.
 */

export class OrderServiceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OrderServiceError";
  }
}

type SessionUser = { id: string; role: Role };

// --- state machine (guardrail §3) -------------------------------------------

/** The ONLY allowed status transitions. Empty array = terminal state. */
export const ORDER_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  DRAFT: ["AWAITING_PAYMENT", "CANCELLED"],
  AWAITING_PAYMENT: ["PAID", "UNDERPAID", "EXPIRED", "CANCELLED"],
  UNDERPAID: ["PAID", "EXPIRED", "CANCELLED", "REFUNDED"],
  PAID: ["DELIVERED", "DISPUTED", "REFUNDED", "CANCELLED"],
  DELIVERED: ["COMPLETED", "DISPUTED"],
  DISPUTED: ["COMPLETED", "REFUNDED"],
  COMPLETED: [],
  REFUNDED: [],
  CANCELLED: [],
  EXPIRED: [],
};

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return ORDER_TRANSITIONS[from].includes(to);
}

// --- create -----------------------------------------------------------------

/**
 * Create (or re-price an existing open) order for the buyer, in
 * AWAITING_PAYMENT. Idempotent: at most ONE open (AWAITING_PAYMENT) order per
 * (buyer, listing) — a double-click returns/updates the same row instead of
 * duplicating. All money is recomputed from the DB listing.
 */
export async function createOrder(
  user: SessionUser,
  input: CreateOrderParsed,
): Promise<Order> {
  return db.$transaction(async (tx) => {
    const listing = await tx.listing.findUnique({
      where: { slug: input.listingSlug },
      select: {
        id: true,
        sellerId: true,
        priceMinor: true,
        currency: true,
        stock: true,
        status: true,
        type: true,
        seller: { select: { userId: true } },
      },
    });

    if (!listing || listing.status !== "ACTIVE") {
      throw new OrderServiceError(
        "This listing is no longer available for purchase.",
      );
    }
    // A seller cannot buy their own listing.
    if (listing.seller.userId === user.id) {
      throw new OrderServiceError("You cannot buy your own listing.");
    }
    if (listing.stock <= 0) {
      throw new OrderServiceError("This listing is out of stock.");
    }
    if (input.qty > listing.stock) {
      throw new OrderServiceError(
        `Only ${listing.stock} in stock — reduce the quantity.`,
      );
    }

    // Recompute ALL money server-side from the DB (never trust the client).
    const { subtotalMinor, platformFeeMinor, totalMinor } = computeBuyerFee(
      listing.priceMinor,
      input.qty,
    );
    const sellerFeeMinor = computeSellerCommissionMinor(
      subtotalMinor,
      listing.type,
    );

    const data = {
      qty: input.qty,
      unitPriceMinor: listing.priceMinor,
      feeMinor: platformFeeMinor,
      sellerFeeMinor,
      totalMinor,
      currency: listing.currency,
      paymentProvider: input.provider ?? null,
      status: "AWAITING_PAYMENT" as const,
    };

    // Idempotency: reuse the buyer's existing open order for this listing.
    const existing = await tx.order.findFirst({
      where: {
        buyerId: user.id,
        listingId: listing.id,
        status: "AWAITING_PAYMENT",
      },
      select: { id: true },
    });

    if (existing) {
      return tx.order.update({ where: { id: existing.id }, data });
    }

    return tx.order.create({
      data: {
        buyerId: user.id,
        sellerId: listing.sellerId,
        listingId: listing.id,
        ...data,
      },
    });
  });
}

// --- transition (guardrail §3) ----------------------------------------------

/**
 * Move an order to `to`, rejecting any transition not in ORDER_TRANSITIONS.
 * The status check + write happen in one transaction (no TOCTOU). Returns the
 * updated order; throws OrderServiceError on an illegal transition.
 */
export async function transitionOrder(
  orderId: string,
  to: OrderStatus,
): Promise<Order> {
  return db.$transaction(async (tx) => {
    const order = await tx.order.findUnique({
      where: { id: orderId },
      select: { id: true, status: true },
    });
    if (!order) throw new OrderServiceError("Order not found.");

    if (!canTransition(order.status, to)) {
      throw new OrderServiceError(
        `Cannot move an order from ${order.status} to ${to}.`,
      );
    }

    return tx.order.update({ where: { id: orderId }, data: { status: to } });
  });
}

// --- reads ------------------------------------------------------------------

const orderDetailInclude = {
  listing: {
    select: { title: true, slug: true, type: true, deliveryType: true, images: true },
  },
  seller: {
    select: {
      displayName: true,
      trustScore: true,
      userId: true,
      user: { select: { image: true } },
    },
  },
} satisfies Prisma.OrderInclude;

export type OrderDetail = Prisma.OrderGetPayload<{
  include: typeof orderDetailInclude;
}>;

/**
 * One order for the buyer OR the order's seller (or admin). Returns null when
 * the caller owns neither side — 404, not 403 (no resource enumeration).
 */
export async function getOrder(
  user: SessionUser,
  orderId: string,
): Promise<OrderDetail | null> {
  const order = await db.order.findUnique({
    where: { id: orderId },
    include: orderDetailInclude,
  });
  if (!order) return null;

  const isBuyer = order.buyerId === user.id;
  const isSeller = order.seller.userId === user.id;
  if (!isBuyer && !isSeller && user.role !== "ADMIN") return null;

  return order;
}

export type BuyerOrderRow = {
  id: string;
  status: OrderStatus;
  qty: number;
  totalMinor: number;
  currency: string;
  createdAt: Date;
  listingTitle: string;
  listingSlug: string;
  sellerName: string;
};

/** The buyer's orders, newest first (orders list page). Uses @@index([buyerId]). */
export async function getBuyerOrders(userId: string): Promise<BuyerOrderRow[]> {
  const rows = await db.order.findMany({
    where: { buyerId: userId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      status: true,
      qty: true,
      totalMinor: true,
      currency: true,
      createdAt: true,
      listing: { select: { title: true, slug: true } },
      seller: { select: { displayName: true } },
    },
  });

  return rows.map(({ listing, seller, ...row }) => ({
    ...row,
    listingTitle: listing.title,
    listingSlug: listing.slug,
    sellerName: seller.displayName,
  }));
}
