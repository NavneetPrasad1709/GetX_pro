import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { siteConfig } from "@/config/site";
import { encrypt, decrypt, isEncryptionAvailable } from "@/lib/encryption";

/**
 * Auto / instant delivery (Step 19). SERVER-SIDE ONLY.
 *
 * Sellers pre-load encrypted items; the moment an INSTANT order is PAID, exactly ONE item is
 * atomically assigned (`FOR UPDATE SKIP LOCKED`) inside the payment transaction and the order
 * transitions PAID → DELIVERED (escrow timer starts, same as a manual delivery). Item content is
 * AES-256-GCM encrypted at rest and ONLY decrypted server-side for the order's buyer.
 *
 * INVARIANT: a stockout (or a missing encryption key) NEVER fails a payment — it throws the
 * controlled `DeliveryStockoutError` BEFORE any write, so the caller can fall back to MANUAL
 * delivery cleanly. Any other (unexpected) error propagates and rolls the payment tx back.
 */

type Tx = Prisma.TransactionClient;

const AUTO_RELEASE_DAYS = siteConfig.escrow.autoReleaseDays;
const MAX_ITEM_CHARS = 10_000;
const LOW_STOCK = 5;

export class DeliveryServiceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DeliveryServiceError";
  }
}

/** Controlled signal: no item to assign (or encryption unavailable) → caller falls back to MANUAL. */
export class DeliveryStockoutError extends Error {
  constructor() {
    super("No delivery item available");
    this.name = "DeliveryStockoutError";
  }
}

function computeAutoReleaseAt(now: Date): Date {
  return new Date(now.getTime() + AUTO_RELEASE_DAYS * 24 * 60 * 60 * 1000);
}

/** Resolve a listing the acting user owns + that is INSTANT-delivery. Throws otherwise. */
async function ownedInstantListing(listingId: string, userId: string) {
  const listing = await db.listing.findUnique({
    where: { id: listingId },
    select: { id: true, sellerId: true, status: true, deliveryType: true, seller: { select: { userId: true } } },
  });
  if (!listing || listing.seller.userId !== userId) {
    throw new DeliveryServiceError("Listing not found.");
  }
  if (listing.deliveryType !== "INSTANT") {
    throw new DeliveryServiceError("This listing is not set to instant delivery.");
  }
  return listing;
}

// --- seller: manage stock ---------------------------------------------------

/**
 * Encrypt + bulk-insert delivery items for an INSTANT listing the user owns. If the listing was
 * auto-paused for a stockout and now has stock, it auto-unpauses. Returns the count added.
 */
export async function addDeliveryItems(
  listingId: string,
  userId: string,
  plaintexts: string[],
): Promise<number> {
  const listing = await ownedInstantListing(listingId, userId);
  if (!isEncryptionAvailable()) {
    throw new DeliveryServiceError("Auto-delivery is currently unavailable.");
  }

  const cleaned = plaintexts.map((p) => p.trim()).filter((p) => p.length > 0);
  if (cleaned.length === 0) throw new DeliveryServiceError("Add at least one item.");
  const tooLong = cleaned.findIndex((p) => p.length > MAX_ITEM_CHARS);
  if (tooLong !== -1) {
    throw new DeliveryServiceError(`Item ${tooLong + 1} is too long (max ${MAX_ITEM_CHARS} characters).`);
  }

  const created = await db.deliveryItem.createMany({
    data: cleaned.map((p) => ({
      listingId: listing.id,
      sellerId: listing.sellerId,
      content: encrypt(p),
      status: "AVAILABLE" as const,
    })),
  });

  // Auto-unpause ONLY if the listing was paused specifically for a stockout (not a manual/stale pause).
  if (listing.status === "PAUSED") {
    const lastPause = await db.auditLog.findFirst({
      where: { entity: "Listing", entityId: listing.id },
      orderBy: { createdAt: "desc" },
      select: { action: true },
    });
    if (lastPause?.action === "auto_pause_stockout") {
      await db.$transaction([
        db.listing.updateMany({ where: { id: listing.id, status: "PAUSED" }, data: { status: "ACTIVE" } }),
        db.auditLog.create({ data: { action: "auto_unpause_restock", entity: "Listing", entityId: listing.id } }),
      ]);
    }
  }

  return created.count;
}

export async function deleteDeliveryItem(itemId: string, userId: string): Promise<void> {
  const item = await db.deliveryItem.findUnique({
    where: { id: itemId },
    select: { id: true, status: true, seller: { select: { userId: true } } },
  });
  if (!item || item.seller.userId !== userId) {
    throw new DeliveryServiceError("Item not found.");
  }
  if (item.status !== "AVAILABLE") {
    throw new DeliveryServiceError("Delivered items can't be removed.");
  }
  await db.deliveryItem.delete({ where: { id: itemId } });
}

export async function getDeliveryItemCount(listingId: string): Promise<number> {
  return db.deliveryItem.count({ where: { listingId, status: "AVAILABLE" } });
}

export type DeliveryStockInfo = {
  count: number;
  lowStock: boolean;
  items: { id: string; preview: string }[]; // masked: first 4 chars only
};

/** Owner-only masked view of AVAILABLE items for the seller UI (decrypts to preview first 4 chars). */
export async function getSellerDeliveryStock(
  listingId: string,
  userId: string,
): Promise<DeliveryStockInfo> {
  await ownedInstantListing(listingId, userId);
  const rows = await db.deliveryItem.findMany({
    where: { listingId, status: "AVAILABLE" },
    orderBy: { createdAt: "asc" },
    take: 200,
    select: { id: true, content: true },
  });
  const items = rows.map((r) => {
    let preview = "••••";
    try {
      preview = `${decrypt(r.content).slice(0, 4)}…`;
    } catch {
      /* undecryptable (e.g. key rotated) — keep masked */
    }
    return { id: r.id, preview };
  });
  return { count: items.length, lowStock: items.length < LOW_STOCK, items };
}

// --- atomic assignment at PAID (inside the payment tx) -----------------------

/**
 * Assign one AVAILABLE item to the order and transition it PAID → DELIVERED, inside a transaction.
 * Idempotent + safe: no-ops if the order isn't PAID or is already delivered; detects stockout /
 * missing key by throwing `DeliveryStockoutError` BEFORE any write so the caller falls back to
 * MANUAL cleanly. Runs in its OWN short transaction (separate lock domain from the seller wallet),
 * so concurrent INSTANT payments don't contend with the escrow hold.
 */
async function autoDeliverInTx(
  tx: Tx,
  args: { orderId: string; listingId: string },
): Promise<void> {
  if (!isEncryptionAvailable()) throw new DeliveryStockoutError();

  // Idempotency: only a still-PAID, not-yet-delivered order is eligible (a retry/dup is a no-op).
  const order = await tx.order.findUnique({ where: { id: args.orderId }, select: { status: true } });
  if (!order || order.status !== "PAID") return;
  const already = await tx.deliveryItem.findFirst({
    where: { orderId: args.orderId, status: "DELIVERED" },
    select: { id: true },
  });
  if (already) return;

  // Lock + pick exactly one available item; concurrent PAID events get distinct items.
  const rows = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM "DeliveryItem"
    WHERE "listingId" = ${args.listingId} AND status = 'AVAILABLE'
    ORDER BY "createdAt" ASC
    LIMIT 1
    FOR UPDATE SKIP LOCKED`;
  if (rows.length === 0) throw new DeliveryStockoutError(); // no write yet — safe fallback

  const now = new Date();
  await tx.deliveryItem.update({
    where: { id: rows[0].id },
    data: { status: "DELIVERED", orderId: args.orderId, deliveredAt: now },
  });
  await tx.order.updateMany({
    where: { id: args.orderId, status: "PAID" },
    data: { status: "DELIVERED", deliveredAt: now, autoReleaseAt: computeAutoReleaseAt(now) },
  });
  await tx.auditLog.create({
    data: { action: "ORDER_AUTO_DELIVERED", entity: "Order", entityId: args.orderId, meta: { itemId: rows[0].id } },
  });
}

/**
 * Public auto-deliver: runs `autoDeliverInTx` in its own short transaction. Called POST-COMMIT from
 * the payment handler (awaited) so the payment tx stays short + uncontended. Throws
 * `DeliveryStockoutError` on stockout/no-key → caller falls back to MANUAL.
 */
export async function autoDeliver(
  orderId: string,
  listingId: string,
): Promise<void> {
  await db.$transaction((tx) => autoDeliverInTx(tx, { orderId, listingId }));
}

/** Pause a listing that just hit 0 stock + audit it. Called post-commit (never blocks payment). */
export async function pauseListingOnStockout(listingId: string): Promise<void> {
  const moved = await db.listing.updateMany({
    where: { id: listingId, status: "ACTIVE" },
    data: { status: "PAUSED" },
  });
  if (moved.count > 0) {
    await db.auditLog.create({
      data: { action: "auto_pause_stockout", entity: "Listing", entityId: listingId },
    });
  }
}

// --- buyer: read the delivered content (decrypt on read) --------------------

/**
 * Decrypt the delivered item for an order, for the order's buyer (or seller/admin). Returns
 * plaintext, or null if none / not authorized. Plaintext is NEVER stored or logged — this is the
 * only place item content is decrypted, and only server-side for an authorized viewer.
 */
export async function getDeliveryContentForOrder(
  orderId: string,
  userId: string,
  isAdmin = false,
): Promise<string | null> {
  const order = await db.order.findUnique({
    where: { id: orderId },
    select: { buyerId: true, seller: { select: { userId: true } } },
  });
  if (!order) return null;
  const allowed = isAdmin || order.buyerId === userId || order.seller.userId === userId;
  if (!allowed) return null;

  const item = await db.deliveryItem.findFirst({
    where: { orderId, status: "DELIVERED" },
    select: { content: true },
  });
  if (!item) return null;
  try {
    return decrypt(item.content);
  } catch {
    return null; // key missing/rotated — fail closed, no crash
  }
}
