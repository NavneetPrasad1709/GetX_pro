import type { Metadata } from "next";
import { ShieldCheckIcon } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { getCatalogForForm } from "@/server/services/catalog";
import { getSellerStats } from "@/server/services/listings";
import { getMyKycStatus } from "@/server/services/kyc";
import { ListingForm } from "@/components/seller/listing-form";
import { CtaLink } from "@/components/shared/cta-link";

export const metadata: Metadata = { title: "New listing" };

/** Create listing — the catalog tree feeds the game/category selects.
 *  Selling is gated on an APPROVED KYC (O-T2). */
export default async function NewListingPage() {
  const session = await requireUser();
  const [catalog, stats, kyc] = await Promise.all([
    getCatalogForForm(),
    getSellerStats(session.user.id),
    getMyKycStatus(session.user.id),
  ]);

  // Mandatory KYC before selling (O-T2, legal) — no listing form until the
  // seller's identity is verified. createListing enforces the same rule.
  if (kyc.status !== "APPROVED") {
    const pending = kyc.status === "PENDING";
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-4 rounded-xl border border-border bg-card p-6 text-center">
        <ShieldCheckIcon className="size-8 text-primary" aria-hidden="true" />
        <h1 className="text-xl font-bold tracking-tight">
          {pending
            ? "Verification in review"
            : "Verify your identity to start selling"}
        </h1>
        <p className="text-sm text-muted-foreground">
          {pending
            ? "Your ID is under review. You can create listings as soon as it's approved — usually within a day."
            : "Every GETX seller is ID-verified before they can list, so buyers can trust the marketplace. It only takes a couple of minutes."}
        </p>
        <CtaLink href="/seller/verify">
          {pending ? "Check verification status" : "Verify my identity"}
        </CtaLink>
      </div>
    );
  }

  const isFirstListing = stats.activeListings + stats.draftListings === 0;

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">New listing</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Save as a draft anytime — publish when it&apos;s ready.
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
