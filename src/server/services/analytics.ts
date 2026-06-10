import { db } from "@/lib/db";

/**
 * Founder/admin analytics (Prompt 14; expanded in Prompt 19). SERVER-SIDE ONLY,
 * called from ADMIN-gated routes. Counts are cheap COUNT(*) queries on indexed
 * SellerProfile milestone columns, parallelized.
 */

export type SellerActivationFunnel = {
  totalRegistered: number;
  kycSubmitted: number;
  kycApproved: number;
  firstListingPublished: number;
  firstSaleClosed: number;
  rates: {
    kycSubmitRate: number;
    kycApproveRate: number;
    listingRate: number;
    firstSaleRate: number;
    end2endRate: number;
  };
};

/**
 * Seller activation funnel: signup → KYC submit → KYC approve → first listing →
 * first sale. `since` filters by SellerProfile.createdAt (default: all time).
 */
export async function getSellerActivationFunnel(
  since?: Date,
): Promise<SellerActivationFunnel> {
  const where = since ? { createdAt: { gte: since } } : {};

  const [
    totalRegistered,
    kycSubmitted,
    kycApproved,
    firstListingPublished,
    firstSaleClosed,
  ] = await Promise.all([
    db.sellerProfile.count({ where }),
    db.sellerProfile.count({ where: { ...where, kycSubmittedAt: { not: null } } }),
    db.sellerProfile.count({ where: { ...where, kycStatus: "APPROVED" } }),
    db.sellerProfile.count({ where: { ...where, firstListingAt: { not: null } } }),
    db.sellerProfile.count({ where: { ...where, firstSaleAt: { not: null } } }),
  ]);

  const safe = (num: number, den: number) => (den > 0 ? num / den : 0);

  return {
    totalRegistered,
    kycSubmitted,
    kycApproved,
    firstListingPublished,
    firstSaleClosed,
    rates: {
      kycSubmitRate: safe(kycSubmitted, totalRegistered),
      kycApproveRate: safe(kycApproved, kycSubmitted),
      listingRate: safe(firstListingPublished, kycApproved),
      firstSaleRate: safe(firstSaleClosed, firstListingPublished),
      end2endRate: safe(firstSaleClosed, totalRegistered),
    },
  };
}
