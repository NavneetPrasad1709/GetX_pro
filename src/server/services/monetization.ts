import {
  Prisma,
  type LedgerReason,
  type Role,
} from "@prisma/client";
import { db } from "@/lib/db";
import { assertOwner } from "@/lib/auth";
import { siteConfig } from "@/config/site";
import { getWalletBalances } from "@/server/services/wallet";
import { PLATFORM_WALLET_ID } from "@/server/services/escrow";
import {
  computeBoostFeeMinor,
  type BoostDuration,
} from "@/lib/fees";

/**
 * Opt-in monetization (Prompt 15) — featured boosts + GETX Pro. SERVER-SIDE ONLY.
 *
 * Money rules (guardrails §1/§5): every charge is a DEBIT on the seller wallet +
 * a CREDIT FEE on the single PLATFORM wallet, inside ONE transaction, with the
 * seller wallet row LOCKED (FOR UPDATE) before reading the available balance.
 * Non-order fees carry orderId = null on the ledger (the column is nullable).
 */

export class MonetizationServiceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MonetizationServiceError";
  }
}

type Tx = Prisma.TransactionClient;
type SessionUser = { id: string; role: Role };

const DAY_MS = 24 * 60 * 60 * 1000;

async function lockWallet(tx: Tx, walletId: string): Promise<void> {
  await tx.$queryRaw`SELECT id FROM "Wallet" WHERE id = ${walletId} FOR UPDATE`;
}

/**
 * Charge `amountMinor` from a seller's AVAILABLE balance to platform revenue.
 * Locks the seller wallet, validates available funds, writes the DEBIT + the
 * PLATFORM CREDIT FEE, and refreshes both cached balances. Throws if the seller
 * can't cover it (escrow-held money is never spendable here).
 */
async function chargeSellerToPlatform(
  tx: Tx,
  sellerProfileId: string,
  currency: string,
  amountMinor: number,
  reason: Extract<LedgerReason, "BOOST_FEE" | "SUBSCRIPTION_FEE">,
): Promise<void> {
  // Ensure + lock the seller wallet BEFORE reading available funds.
  const wallet = await tx.wallet.upsert({
    where: { sellerProfileId },
    create: { sellerProfileId, currency },
    update: {},
    select: { id: true },
  });
  await lockWallet(tx, wallet.id);

  const { availableMinor, grossMinor } = await getWalletBalances(wallet.id, tx);
  if (availableMinor < amountMinor) {
    throw new MonetizationServiceError(
      "Not enough available balance — top up your wallet from a completed sale first.",
    );
  }

  // Seller wallet: DEBIT the fee (orderId null — not tied to an order).
  const sellerAfter = grossMinor - amountMinor;
  await tx.ledgerEntry.create({
    data: {
      walletId: wallet.id,
      orderId: null,
      type: "DEBIT",
      reason,
      amountMinor,
      balanceAfterMinor: sellerAfter,
    },
  });
  await tx.wallet.update({
    where: { id: wallet.id },
    data: { cachedBalanceMinor: sellerAfter },
  });

  // Platform wallet: CREDIT FEE (race-safe get-or-create of the singleton).
  await tx.wallet.createMany({
    data: [{ id: PLATFORM_WALLET_ID, kind: "PLATFORM", currency }],
    skipDuplicates: true,
  });
  await lockWallet(tx, PLATFORM_WALLET_ID);
  const platBalances = await getWalletBalances(PLATFORM_WALLET_ID, tx);
  const platAfter = platBalances.grossMinor + amountMinor;
  await tx.ledgerEntry.create({
    data: {
      walletId: PLATFORM_WALLET_ID,
      orderId: null,
      type: "CREDIT",
      reason: "FEE",
      amountMinor,
      balanceAfterMinor: platAfter,
    },
  });
  await tx.wallet.update({
    where: { id: PLATFORM_WALLET_ID },
    data: { cachedBalanceMinor: platAfter },
  });
}

// ---------------------------------------------------------------------------
// Stream 1/2 — Featured / boosted listings
// ---------------------------------------------------------------------------

/**
 * Pay to feature a listing as "Promoted" for a daily/weekly period. Re-buying an
 * already-active boost EXTENDS the window (stacks time) and charges again.
 */
export async function boostListing(
  user: SessionUser,
  listingId: string,
  duration: BoostDuration,
  now = new Date(),
): Promise<void> {
  const { maxActiveFeaturedPerSeller } = siteConfig.fees.boost;

  await db.$transaction(async (tx) => {
    const listing = await tx.listing.findUnique({
      where: { id: listingId },
      select: {
        id: true,
        sellerId: true,
        status: true,
        stock: true,
        currency: true,
        isFeatured: true,
        boostExpiresAt: true,
        seller: { select: { userId: true } },
      },
    });
    if (!listing) throw new MonetizationServiceError("Listing not found.");
    assertOwner({ userId: listing.seller.userId }, user);

    if (listing.status !== "ACTIVE" || listing.stock <= 0) {
      throw new MonetizationServiceError(
        "Only active, in-stock listings can be boosted.",
      );
    }

    const stillActive =
      listing.isFeatured &&
      listing.boostExpiresAt != null &&
      listing.boostExpiresAt > now;

    // Cap simultaneous boosts — but re-buying one already active is always allowed.
    if (!stillActive) {
      const activeBoosts = await tx.listing.count({
        where: {
          sellerId: listing.sellerId,
          isFeatured: true,
          boostExpiresAt: { gt: now },
        },
      });
      if (activeBoosts >= maxActiveFeaturedPerSeller) {
        throw new MonetizationServiceError(
          `You can feature up to ${maxActiveFeaturedPerSeller} listings at once. Wait for one to expire.`,
        );
      }
    }

    const feeMinor = computeBoostFeeMinor(duration);
    await chargeSellerToPlatform(
      tx,
      listing.sellerId,
      listing.currency,
      feeMinor,
      "BOOST_FEE",
    );

    // Extend from the later of now / current expiry so re-buys stack time.
    const from =
      stillActive && listing.boostExpiresAt ? listing.boostExpiresAt : now;
    const addMs = duration === "daily" ? DAY_MS : 7 * DAY_MS;
    const boostExpiresAt = new Date(from.getTime() + addMs);

    await tx.listing.update({
      where: { id: listing.id },
      data: { isFeatured: true, boostExpiresAt },
    });
    await tx.auditLog.create({
      data: {
        actorId: user.id,
        action: "LISTING_BOOSTED",
        entity: "Listing",
        entityId: listing.id,
        meta: { duration, feeMinor, boostExpiresAt: boostExpiresAt.toISOString() },
      },
    });
  });
}

// ---------------------------------------------------------------------------
// Stream 4 — GETX Pro subscription
// ---------------------------------------------------------------------------

/**
 * Subscribe to (or extend) GETX Pro for 30 days. Idempotent extend: re-buying
 * while active adds 30 days onto the existing expiry.
 */
export async function subscribePro(
  user: SessionUser,
  now = new Date(),
): Promise<void> {
  const feeMinor = siteConfig.fees.subscription.proMonthlyFeeMinor;

  await db.$transaction(async (tx) => {
    const profile = await tx.sellerProfile.findUnique({
      where: { userId: user.id },
      select: {
        id: true,
        subscriptionTier: true,
        subscriptionExpiresAt: true,
        wallet: { select: { currency: true } },
      },
    });
    if (!profile) throw new MonetizationServiceError("Seller account not found.");

    const currency = profile.wallet?.currency ?? "INR";
    await chargeSellerToPlatform(
      tx,
      profile.id,
      currency,
      feeMinor,
      "SUBSCRIPTION_FEE",
    );

    const active =
      profile.subscriptionTier === "PRO" &&
      profile.subscriptionExpiresAt != null &&
      profile.subscriptionExpiresAt > now;
    const from =
      active && profile.subscriptionExpiresAt
        ? profile.subscriptionExpiresAt
        : now;
    const subscriptionExpiresAt = new Date(from.getTime() + 30 * DAY_MS);

    await tx.sellerProfile.update({
      where: { id: profile.id },
      data: { subscriptionTier: "PRO", subscriptionExpiresAt },
    });
    await tx.auditLog.create({
      data: {
        actorId: user.id,
        action: "SUBSCRIPTION_PRO",
        entity: "SellerProfile",
        entityId: profile.id,
        meta: { feeMinor, subscriptionExpiresAt: subscriptionExpiresAt.toISOString() },
      },
    });
  });
}

// ---------------------------------------------------------------------------
// Stream 3 — Spotlight sponsorship
// ---------------------------------------------------------------------------

/**
 * Buy/extend a weekly spotlight slot (Prompt 15b). Quality-gated: KYC-approved,
 * min rating + sales, not currently disputed, and only while a slot is free.
 * Re-buying extends by another week.
 */
export async function sponsorSeller(
  user: SessionUser,
  now = new Date(),
): Promise<void> {
  const {
    weeklyFeeMinor,
    maxSponsoredSellers,
    minRatingForSponsorship,
    minSalesForSponsorship,
  } = siteConfig.fees.sponsorship;

  await db.$transaction(async (tx) => {
    const profile = await tx.sellerProfile.findUnique({
      where: { userId: user.id },
      select: {
        id: true,
        kycStatus: true,
        ratingAvg: true,
        ratingCount: true,
        totalSales: true,
        isSponsored: true,
        sponsorshipExpiresAt: true,
        wallet: { select: { currency: true } },
      },
    });
    if (!profile) throw new MonetizationServiceError("Seller account not found.");

    const active =
      profile.isSponsored &&
      profile.sponsorshipExpiresAt != null &&
      profile.sponsorshipExpiresAt > now;

    // Eligibility (skip re-checks when simply extending an active slot).
    if (!active) {
      if (profile.kycStatus !== "APPROVED") {
        throw new MonetizationServiceError(
          "Spotlight requires a verified (KYC-approved) account.",
        );
      }
      if (profile.totalSales < minSalesForSponsorship) {
        throw new MonetizationServiceError(
          `Spotlight needs at least ${minSalesForSponsorship} completed sales.`,
        );
      }
      if (profile.ratingCount > 0 && profile.ratingAvg < minRatingForSponsorship) {
        throw new MonetizationServiceError(
          `Spotlight needs a ${minRatingForSponsorship}★+ rating.`,
        );
      }
      const disputed = await tx.order.count({
        where: { sellerId: profile.id, status: "DISPUTED" },
      });
      if (disputed > 0) {
        throw new MonetizationServiceError(
          "Resolve your open disputes before buying a spotlight.",
        );
      }
      const taken = await tx.sellerProfile.count({
        where: {
          isSponsored: true,
          sponsorshipExpiresAt: { gt: now },
          id: { not: profile.id },
        },
      });
      if (taken >= maxSponsoredSellers) {
        throw new MonetizationServiceError(
          "All spotlight slots are currently taken — try again next week.",
        );
      }
    }

    await chargeSellerToPlatform(
      tx,
      profile.id,
      profile.wallet?.currency ?? "INR",
      weeklyFeeMinor,
      "BOOST_FEE",
    );

    const from =
      active && profile.sponsorshipExpiresAt ? profile.sponsorshipExpiresAt : now;
    const sponsorshipExpiresAt = new Date(from.getTime() + 7 * DAY_MS);
    await tx.sellerProfile.update({
      where: { id: profile.id },
      data: { isSponsored: true, sponsorshipExpiresAt },
    });
    await tx.auditLog.create({
      data: {
        actorId: user.id,
        action: "SELLER_SPONSORED",
        entity: "SellerProfile",
        entityId: profile.id,
        meta: { weeklyFeeMinor, sponsorshipExpiresAt: sponsorshipExpiresAt.toISOString() },
      },
    });
  });
}

// ---------------------------------------------------------------------------
// Admin recourse + cron helpers
// ---------------------------------------------------------------------------

/** Admin force-clears a listing's boost (fraud/abuse recourse). Audit-logged by caller. */
export async function clearListingBoost(listingId: string): Promise<void> {
  await db.listing.update({
    where: { id: listingId },
    data: { isFeatured: false, boostExpiresAt: null },
  });
}
