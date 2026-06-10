import type { Prisma } from "@prisma/client";

/**
 * Fraud auto-actions (Prompt 16). Each runs INSIDE the same transaction as the
 * flag upsert — no partial states. All are reversible by an admin except where
 * noted. SERVER-SIDE ONLY.
 */

type Tx = Prisma.TransactionClient;

/**
 * HOLD_PAYOUT — freeze a seller's payouts pending review. Sets
 * SellerProfile.payoutHeldAt + User.payoutHeld; the payout service fails closed
 * on either. Idempotent.
 */
export async function holdPayout(
  tx: Tx,
  sellerId: string,
  flagId: string,
): Promise<void> {
  const profile = await tx.sellerProfile.update({
    where: { id: sellerId },
    data: { payoutHeldAt: new Date() },
    select: { userId: true },
  });
  await tx.user.update({
    where: { id: profile.userId },
    data: { payoutHeld: true },
  });
  await tx.auditLog.create({
    data: {
      action: "PAYOUT_HELD_BY_FRAUD",
      entity: "SellerProfile",
      entityId: sellerId,
      meta: { flagId },
    },
  });
}

/**
 * FREEZE_LISTING — pause an ACTIVE listing (reversible; never REMOVED). Does
 * not touch in-flight PAID orders (escrow already protects them). Also clears
 * any paid boost so a frozen listing can't keep a Promoted slot.
 */
export async function freezeListing(
  tx: Tx,
  listingId: string,
  flagId: string,
): Promise<void> {
  const res = await tx.listing.updateMany({
    where: { id: listingId, status: "ACTIVE" },
    data: { status: "PAUSED", isFeatured: false, boostExpiresAt: null },
  });
  if (res.count > 0) {
    await tx.auditLog.create({
      data: {
        action: "LISTING_FROZEN_BY_FRAUD",
        entity: "Listing",
        entityId: listingId,
        meta: { flagId },
      },
    });
  }
}

/**
 * FORCE_RE_KYC — reset KYC to NONE and drop pending submissions so the seller
 * must re-verify before listing again. Used only for CRITICAL severity. Does
 * NOT delete the User/SellerProfile (no data loss).
 */
export async function forceReKYC(
  tx: Tx,
  sellerProfileId: string,
  flagId: string,
): Promise<void> {
  await tx.kycSubmission.deleteMany({ where: { sellerId: sellerProfileId } });
  await tx.sellerProfile.update({
    where: { id: sellerProfileId },
    data: { kycStatus: "NONE" },
  });
  await tx.auditLog.create({
    data: {
      action: "FORCE_RE_KYC_BY_FRAUD",
      entity: "SellerProfile",
      entityId: sellerProfileId,
      meta: { flagId },
    },
  });
}
