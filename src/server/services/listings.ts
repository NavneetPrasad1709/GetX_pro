import { randomBytes } from "crypto";
import { Prisma, type Listing, type ListingStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { assertOwner, ForbiddenError } from "@/lib/auth";
import { siteConfig } from "@/config/site";
import { getWalletBalances } from "@/server/services/wallet";
import { isAllowedListingImageUrl } from "@/lib/r2";
import { MAX_LISTING_IMAGES } from "@/lib/validators/upload";
import { syncListingToAlgolia } from "@/server/services/search-sync";
import { fireFraudSignal } from "@/server/services/fraud/dispatch";
import {
  checkListingScamPhrases,
  checkListingPriceAnomaly,
  checkNewSellerHighValue,
} from "@/server/services/fraud/signals";
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

/**
 * Never trust client-sent image URLs: each MUST be a public URL WE issued for a
 * listing image (R2 public bucket, /listings/ prefix). Blocks an attacker from
 * parking an arbitrary off-host URL on a listing (next/image content injection).
 * De-dupes and caps at MAX_LISTING_IMAGES; order is the seller's chosen order
 * (index 0 = primary/cover).
 */
function validateListingImages(urls: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const url of urls) {
    if (seen.has(url)) continue;
    if (!isAllowedListingImageUrl(url)) {
      throw new ListingServiceError(
        "One of the images couldn't be verified — please re-upload it.",
      );
    }
    seen.add(url);
    out.push(url);
    if (out.length >= MAX_LISTING_IMAGES) break;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

export async function createListing(
  user: SessionUser,
  input: ListingFormParsed,
): Promise<Listing> {
  const sellerId = await getSellerProfileId(user.id);

  const created = await db.$transaction(async (tx) => {
    // Listings are unlimited for every tier (O-T5) — no active-listing cap.
    // totalSales is still needed for the new-seller visibility boost below.
    const [category, profile] = await Promise.all([
      resolveCategory(tx, input.gameId, input.categoryId),
      tx.sellerProfile.findUniqueOrThrow({
        where: { id: sellerId },
        select: { totalSales: true, kycStatus: true },
      }),
    ]);
    // Mandatory KYC before selling (O-T2, legal) — no listing (draft or live)
    // until the seller's identity is verified. The new-listing page gates this
    // in the UI too, but the server is the real enforcement.
    if (profile.kycStatus !== "APPROVED") {
      throw new ListingServiceError(
        "Verify your identity before listing. Complete KYC verification to start selling.",
      );
    }

    const now = new Date();
    const { staleListingDays, newSellerBoostDays, newSellerBoostMaxSales } =
      siteConfig.liquidity;
    // New-seller visibility boost (Prompt 12): display-only search-rank perk for
    // sellers with almost no sales — never touches money/escrow/fees.
    const newSellerBoostUntil =
      profile.totalSales < newSellerBoostMaxSales
        ? new Date(now.getTime() + newSellerBoostDays * 86_400_000)
        : null;
    // Auto-expiry feeds the stale-pause cron; bumped on every edit/reactivation.
    const expiresAt = new Date(now.getTime() + staleListingDays * 86_400_000);

    const listing = await tx.listing.create({
      data: {
        sellerId,
        gameId: category.gameId,
        categoryId: category.id,
        type: category.kind, // derived server-side — never trust the client
        title: input.title,
        slug: newListingSlug(input.title),
        description: input.description,
        priceMinor: input.price,
        currency: "USD",
        stock: input.stock,
        deliveryType: input.deliveryType,
        attributes: parseAttributesForKind(category.kind, input.attributes),
        status: input.publish ? "ACTIVE" : "DRAFT",
        images: validateListingImages(input.images),
        lastActivityAt: now,
        expiresAt,
        newSellerBoostUntil,
      },
    });

    // Activation milestone (Prompt 14): first ACTIVE listing only.
    if (input.publish) {
      await tx.sellerProfile.updateMany({
        where: { id: sellerId, firstListingAt: null },
        data: { firstListingAt: now },
      });
    }

    return listing;
  });

  runListingFraudSignals(created.id);
  void syncListingToAlgolia(created.id); // Step 28: fire-and-forget index sync (no-op without keys)
  return created;
}

/** Fire the listing-integrity signals (S5/S6/S7) fire-and-forget post-commit. */
function runListingFraudSignals(listingId: string): void {
  fireFraudSignal("scam_phrase_content", checkListingScamPhrases(listingId));
  fireFraudSignal("new_seller_price_anomaly", checkListingPriceAnomaly(listingId));
  fireFraudSignal("new_seller_high_value", checkNewSellerHighValue(listingId));
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
  const updated = await db.$transaction(async (tx) => {
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
        images: validateListingImages(input.images),
        // Edit = activity → resets the 60-day stale-pause clock (Prompt 12).
        lastActivityAt: new Date(),
        // publish=true from the edit form promotes a DRAFT; never demotes.
        ...(input.publish && listing.status === "DRAFT"
          ? { status: "ACTIVE" as const }
          : {}),
      },
    });
  });

  runListingFraudSignals(updated.id);
  void syncListingToAlgolia(updated.id); // Step 28
  return updated;
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
  const result = await db.$transaction(async (tx) => {
    const listing = await getOwnedListingForUpdate(tx, listingId, user);
    const transition = STATUS_TRANSITIONS[action];

    if (!transition.from.includes(listing.status)) {
      throw new ListingServiceError(
        `Cannot ${action} a ${listing.status.toLowerCase()} listing.`,
      );
    }

    const updated = await tx.listing.update({
      where: { id: listingId },
      data: {
        status: transition.to,
        // Re-activation counts as activity → reset the stale-pause clock and
        // extend expiry so a freshly-revived listing isn't paused next sweep.
        ...(action === "activate"
          ? {
              lastActivityAt: new Date(),
              expiresAt: new Date(
                Date.now() + siteConfig.liquidity.staleListingDays * 86_400_000,
              ),
            }
          : // Pausing kills any paid feature (Prompt 15): a hidden listing must
            // never keep a Promoted slot the seller is no longer showing.
            { isFeatured: false, boostExpiresAt: null }),
      },
    });

    // Activation milestone (Prompt 14): publishing a DRAFT via activate counts
    // as the seller's first listing if not already stamped.
    if (action === "activate") {
      await tx.sellerProfile.updateMany({
        where: { id: listing.sellerId, firstListingAt: null },
        data: { firstListingAt: new Date() },
      });
    }

    return updated;
  });
  void syncListingToAlgolia(result.id); // Step 28: re-index (or remove if paused)
  return result;
}

/** Soft delete: status → REMOVED. The row stays (order history needs it). */
export async function removeListing(
  user: SessionUser,
  listingId: string,
): Promise<Listing> {
  const result = await db.$transaction(async (tx) => {
    const listing = await getOwnedListingForUpdate(tx, listingId, user);
    if (listing.status === "SOLD" || listing.status === "REMOVED") {
      throw new ListingServiceError(
        `A ${listing.status.toLowerCase()} listing cannot be removed.`,
      );
    }

    return tx.listing.update({
      where: { id: listingId },
      // Removing also clears any paid feature (Prompt 15).
      data: { status: "REMOVED", isFeatured: false, boostExpiresAt: null },
    });
  });
  void syncListingToAlgolia(result.id); // Step 28: drop from the index
  return result;
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
  /** active paid boost? (Prompt 15) */
  isFeatured: boolean;
  boostExpiresAt: Date | null;
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
      isFeatured: true,
      boostExpiresAt: true,
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
    walletCurrency: profile.wallet?.currency ?? "USD",
    ratingAvg: profile.ratingAvg,
    ratingCount: profile.ratingCount,
    trustScore: profile.trustScore,
  };
}
