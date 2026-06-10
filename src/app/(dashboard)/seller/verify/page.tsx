import type { Metadata } from "next";
import { BadgeCheckIcon, ClockIcon, XCircleIcon, InfoIcon } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { getMyKycStatus } from "@/server/services/kyc";
import { SUMSUB_ENABLED } from "@/lib/sumsub-config";
import { KycUploadForm } from "@/components/seller/kyc-upload-form";
import { SumsubKycWidget } from "@/components/seller/sumsub-kyc-widget";

export const metadata: Metadata = {
  title: "Verify your identity",
  robots: { index: false },
};

const dateFmt = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium" });

/**
 * Seller identity verification (Step 12 manual · Step 29 automated). When Sumsub is configured the
 * embedded liveness + document flow runs; otherwise the manual R2 upload + admin review is shown
 * (graceful degradation — never a dead screen).
 */
export default async function SellerVerifyPage() {
  const session = await requireUser();
  const kyc = await getMyKycStatus(session.user.id);

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Verification</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Verify your identity to unlock payouts and earn the{" "}
          <span className="font-medium text-foreground">ID Verified</span> badge buyers trust.
        </p>
      </div>

      {kyc.status === "APPROVED" ? (
        <div className="flex items-center gap-2.5 rounded-lg border border-success/30 bg-success/5 p-4 text-sm">
          <BadgeCheckIcon className="size-5 shrink-0 text-success" aria-hidden="true" />
          <span>
            <span className="font-semibold">You&apos;re verified.</span> The ID Verified badge now
            shows on your listings.
          </span>
        </div>
      ) : SUMSUB_ENABLED ? (
        // Automated flow — the widget handles NONE / PENDING / REJECTED + live polling.
        <SumsubKycWidget />
      ) : kyc.status === "PENDING" ? (
        <div className="flex items-center gap-2.5 rounded-lg border border-primary/30 bg-primary/5 p-4 text-sm">
          <ClockIcon className="size-5 shrink-0 text-primary" aria-hidden="true" />
          <span>
            <span className="font-semibold">Under review.</span> We&apos;re checking your document
            {kyc.latestSubmittedAt ? ` (submitted ${dateFmt.format(kyc.latestSubmittedAt)})` : ""}. This
            usually takes 1–2 business days.
          </span>
        </div>
      ) : (
        <>
          <div className="flex items-start gap-2.5 rounded-lg border border-warning/30 bg-warning/5 p-4 text-sm">
            <InfoIcon className="size-5 shrink-0 text-warning" aria-hidden="true" />
            <span>
              Automated verification is unavailable. Upload your ID for manual review (1–2 business
              days).
            </span>
          </div>
          {kyc.status === "REJECTED" ? (
            <div className="flex items-center gap-2.5 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm">
              <XCircleIcon className="size-5 shrink-0 text-destructive" aria-hidden="true" />
              <span>
                <span className="font-semibold">Your last document was rejected.</span> Please upload
                a clear, valid government ID and try again.
              </span>
            </div>
          ) : null}
          <KycUploadForm />
        </>
      )}
    </div>
  );
}
