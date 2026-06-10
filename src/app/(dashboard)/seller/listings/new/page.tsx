import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { getCatalogForForm } from "@/server/services/catalog";
import { getSellerStats } from "@/server/services/listings";
import { getMyKycStatus } from "@/server/services/kyc";
import { ListingForm } from "@/components/seller/listing-form";

export const metadata: Metadata = { title: "New listing" };

/** Create listing — the catalog tree feeds the game/category selects.
 *  Prompt 14: first-listing guidance + KYC payout warning. */
export default async function NewListingPage() {
  const session = await requireUser();
  const [catalog, stats, kyc] = await Promise.all([
    getCatalogForForm(),
    getSellerStats(session.user.id),
    getMyKycStatus(session.user.id),
  ]);
  const isFirstListing = stats.activeListings + stats.draftListings === 0;

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">New listing</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Save as a draft anytime — publish when it&apos;s ready. Your first
          listing is free.
        </p>
      </div>
      <ListingForm
        catalog={catalog}
        isFirstListing={isFirstListing}
        kycStatus={kyc.status}
      />
    </div>
  );
}
