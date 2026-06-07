import { randomBytes } from "crypto";
import { Prisma, type Listing, type ListingStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { assertOwner, ForbiddenError } from "@/lib/auth";
import { getWalletBalances } from "@/server/services/wallet";
import type { Role } from "@prisma/client";
import {
  ATTRIBUTE_SCHEMAS,
  cleanAttributes,
  type ListingFormParsed,
} from "@/lib/validators/listing";

/**
 * Listing lifecycle business logic (Step 06): create → edit → pause/activate
 * → remove (soft). SERVER-SIDE ONLY — called from server actions after
 * auth + Zod. Every mutation re-checks ownership INSIDE the transaction.
 *
 * Status machine (guardrails §3 — only these transitions):
 *   DRAFT → ACTIVE (publish) | REMOVED
 *   ACTIVE → PAUSED | REMOVED
 *   PAUSED → ACTIVE | REMOVED
 *   SOLD, REMOVED → terminal (SOLD is a sales record; REMOVED is the soft delete)
 */

export class ListingServiceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ListingServiceError";
  }
}

type SessionUser = { id: string; role: Role };

const EDITABLE_STATUSES: ListingStatus[] = ["DRAFT", "ACTIVE", "PAUSED"];

// ---------------------------------------------------------------------------
// Seller resolution
// ---------------------------------------------------------------------------

/**
 * The caller's SellerProfile id — the seller gate for every mutation.
 * Verified email is implied: becomeSeller() requires it before a profile
 * can exist, and profiles are never created elsewhere.
 */
export async function getSellerProfileId(userId: string): Promise<string> {
  const profile = await db.sellerProfile.findUnique({
    where: { userId },
    select: { id: true },
  });
  if (!profile) {
    throw new ListingServiceError(
      "You need a seller account first — it takes 2 minutes.",
    );
  }
  return profile.id;
}

// ---------------------------------------------------------------------------
// Slug — SEO base from the title + short random suffix (no enumeration,
// no uniqueness races: 4 hex bytes = 4B combinations per title).
// ---------------------------------------------------------------------------

function slugifyTitle(title: string): string {
  const base = title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "") // strip combining accents
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
  return base || "listing";
}

function newListingSlug(title: string): string {
  return `${slugifyTitle(title)}-${randomBytes(4).toString("hex")}`;
}

// ---------------------------------------------------------------------------
// Category/game integrity
// ---------------------------------------------------------------------------

/**
 * The category must exist, belong to the chosen ACTIVE game, and its kind is
 * the AUTHORITATIVE listing type (the client's `type` is UI-only).
 */
async function resolveCategory(
  tx: Prisma.TransactionClient,
  gameId: string,
  categoryId: string,
) {
  const category = await tx.category.findFirst({
    where: { id: categoryId, gameId, game: { isActive: true } },
    select: { id: true, kind: true, gameId: true },
  });
  if (!category) {
    throw new ListingServiceError(
      "That category doesn't exist for the selected game.",
    );
  }
  return category;
}

/**
 * Re-validate attributes against the DERIVED kind (the form validated against
 * the client-claimed type, which could lie) — this also COERCES numeric
 * fields ("42" → 42) before they reach the JSON column.
 */
function parseAttributesForKind(
  kind: keyof typeof ATTRIBUTE_SCHEMAS,
  attributes: Record<string, unknown>,
): Record<string, string | number> {
  const parsed = ATTRIBUTE_SCHEMAS[kind].safeParse(attributes);
  if (!parsed.success) {
    throw new ListingServiceError(
      parsed.error.issues[0]?.message ??
        "Those details don't fit the selected category.",
    );
  }
  return cleanAttributes(parsed.data);
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

export async function createListing(
  user: SessionUser,
  input: ListingFormParsed,
): Promise<Listing> {
  const sellerId = await getSellerProfileId(user.id);

  return db.$transaction(async (tx) => {
    const category = await resolveCategory(tx, input.gameId, input.categoryId);

    return tx.listing.create({
      data: {
        sellerId,
        gameId: category.gameId,
        categoryId: category.id,
        type: category.kind, // derived server-side — never trust the client
        title: input.title,
        slug: newListingSlug(input.title),
        description: input.description,
        priceMinor: input.price,
        currency: "INR",
        stock: input.stock,
        deliveryType: input.deliveryType,
        attributes: parseAttributesForKind(category.kind, input.attributes),
        status: input.publish ? "ACTIVE" : "DRAFT",
        images: [], // real uploads land in Step 12 (R2)
      },
    });
  });
}

// ---------------------------------------------------------------------------
// Ownership-guarded mutations
// ---------------------------------------------------------------------------

/** Loads a listing + owner inside the tx and enforces ownership (or ADMIN). */
async function getOwnedListingForUpdate(
  tx: Prisma.TransactionClient,
  listingId: string,
  user: SessionUser,
) {
  const listing = await tx.listing.findUnique({
    where: { id: listingId },
    include: { seller: { select: { userId: true } } },
  });
  if (!listing) throw new ListingServiceError("Listing not found.");
  assertOwner({ userId: listing.seller.userId }, user);
  return listing;
}

export async function updateListing(
  user: SessionUser,
  listingId: string,
  input: ListingFormParsed,
): Promise<Listing> {
  return db.$transaction(async (tx) => {
    const listing = await getOwnedListingForUpdate(tx, listingId, user);
    if (!EDITABLE_STATUSES.includes(listing.status)) {
      throw new ListingServiceError(
        `A ${listing.status.toLowerCase()} listing can no longer be edited.`,
      );
    }

    const category = await resolveCategory(tx, input.gameId, input.categoryId);

    return tx.listing.update({
      where: { id: listingId },
      data: {
        gameId: category.gameId,
        categoryId: category.id,
        type: category.kind,
        title: input.title,
        // Slug is stable on edit — listing URLs (Step 07) must not break.
        description: input.description,
        priceMinor: input.price,
        stock: input.stock,
        deliveryType: input.deliveryType,
        attributes: parseAttributesForKind(category.kind, input.attributes),
        // publish=true from the edit form promotes a DRAFT; never demotes.
        ...(input.publish && listing.status === "DRAFT"
          ? { status: "ACTIVE" as const }
          : {}),
      },
    });
  });
}

const STATUS_TRANSITIONS: Record<
  "activate" | "pause",
  { from: ListingStatus[]; to: ListingStatus }
> = {
  activate: { from: ["DRAFT", "PAUSED"], to: "ACTIVE" },
  pause: { from: ["ACTIVE"], to: "PAUSED" },
};

export async function setListingStatus(
  user: SessionUser,
  listingId: string,
  action: "activate" | "pause",
): Promise<Listing> {
  return db.$transaction(async (tx) => {
    const listing = await getOwnedListingForUpdate(tx, listingId, user);
    const transition = STATUS_TRANSITIONS[action];

    if (!transition.from.includes(listing.status)) {
      throw new ListingServiceError(
        `Cannot ${action} a ${listing.status.toLowerCase()} listing.`,
      );
    }

    return tx.listing.update({
      where: { id: listingId },
      data: { status: transition.to },
    });
  });
}

/** Soft delete: status → REMOVED. The row stays (order history needs it). */
export async function removeListing(
  user: SessionUser,
  listingId: string,
): Promise<Listing> {
  return db.$transaction(async (tx) => {
    const listing = await getOwnedListingForUpdate(tx, listingId, user);
    if (listing.status === "SOLD" || listing.status === "REMOVED") {
      throw new ListingServiceError(
        `A ${listing.status.toLowerCase()} listing cannot be removed.`,
      );
    }

    return tx.listing.update({
      where: { id: listingId },
      data: { status: "REMOVED" },
    });
  });
}

// ---------------------------------------------------------------------------
// Reads (seller dashboard)
// ---------------------------------------------------------------------------

export type SellerListingRow = {
  id: string;
  title: string;
  slug: string;
  status: ListingStatus;
  type: Listing["type"];
  priceMinor: number;
  currency: string;
  stock: number;
  deliveryType: Listing["deliveryType"];
  gameName: string;
  categoryName: string;
  updatedAt: Date;
};

/** All of the seller's listings except REMOVED (those are "deleted" to them). */
export async function getSellerListings(
  userId: string,
): Promise<SellerListingRow[]> {
  const sellerId = await getSellerProfileId(userId);

  const rows = await db.listing.findMany({
    where: { sellerId, status: { not: "REMOVED" } },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      title: true,
      slug: true,
      status: true,
      type: true,
      priceMinor: true,
      currency: true,
      stock: true,
      deliveryType: true,
      updatedAt: true,
      game: { select: { name: true } },
      category: { select: { name: true } },
    },
  });

  return rows.map(({ game, category, ...row }) => ({
    ...row,
    gameName: game.name,
    categoryName: category.name,
  }));
}

/** One owned listing for the edit form (any status; the page shows guards). */
export async function getOwnedListing(
  user: SessionUser,
  listingId: string,
): Promise<Listing | null> {
  const listing = await db.listing.findUnique({
    where: { id: listingId },
    include: { seller: { select: { userId: true } } },
  });
  if (!listing) return null;
  try {
    assertOwner({ userId: listing.seller.userId }, user);
  } catch (err) {
    // Hide existence from non-owners: 404, not 403 (no resource enumeration).
    if (err instanceof ForbiddenError) return null;
    throw err;
  }
  return listing;
}

/**
 * The wallet's AVAILABLE balance derived from the ledger (guardrails §1).
 * Since Step 09, escrowed money (open ESCROW_HOLDs) sits on the wallet but is
 * NOT the seller's yet — it is excluded here. Full math + the held figure live
 * in `src/server/services/wallet.ts` (getWalletBalances).
 */
export async function getLedgerBalanceMinor(walletId: string): Promise<number> {
  const { availableMinor } = await getWalletBalances(walletId);
  return availableMinor;
}

export type SellerStats = {
  displayName: string;
  activeListings: number;
  draftListings: number;
  pendingOrders: number;
  walletBalanceMinor: number;
  /** escrowed money on paid-but-not-completed orders (Step 09) — not withdrawable yet */
  walletHeldMinor: number;
  walletCurrency: string;
  ratingAvg: number;
  ratingCount: number;
  trustScore: number;
};

/**
 * Dashboard-home stats. Wallet balance is derived from the LEDGER
 * (sum of credits − debits) — `cachedBalanceMinor` is only a cache and is
 * never used for display or decisions (guardrails §1).
 */
export async function getSellerStats(userId: string): Promise<SellerStats> {
  const profile = await db.sellerProfile.findUnique({
    where: { userId },
    select: {
      id: true,
      displayName: true,
      ratingAvg: true,
      ratingCount: true,
      trustScore: true,
      wallet: { select: { id: true, currency: true } },
    },
  });
  if (!profile) {
    throw new ListingServiceError(
      "You need a seller account first — it takes 2 minutes.",
    );
  }

  const [activeListings, draftListings, pendingOrders, balances] =
    await Promise.all([
      db.listing.count({ where: { sellerId: profile.id, status: "ACTIVE" } }),
      db.listing.count({ where: { sellerId: profile.id, status: "DRAFT" } }),
      // "Pending" = money in motion: paid/delivered but not yet completed.
      db.order.count({
        where: { sellerId: profile.id, status: { in: ["PAID", "DELIVERED"] } },
      }),
      profile.wallet
        ? getWalletBalances(profile.wallet.id)
        : Promise.resolve({ availableMinor: 0, heldMinor: 0, grossMinor: 0 }),
    ]);

  return {
    displayName: profile.displayName,
    activeListings,
    draftListings,
    pendingOrders,
    walletBalanceMinor: balances.availableMinor,
    walletHeldMinor: balances.heldMinor,
    walletCurrency: profile.wallet?.currency ?? "INR",
    ratingAvg: profile.ratingAvg,
    ratingCount: profile.ratingCount,
    trustScore: profile.trustScore,
  };
}
