"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { kycSignedUrlAction, reviewKycAction } from "@/server/actions/admin";
import { Button } from "@/components/ui/button";

/**
 * KYC review (Step 15). "View document" mints a short-lived signed R2 URL and
 * opens it (expires fast); approve/reject updates the seller's status.
 */
export function KycReviewActions({ submissionId }: { submissionId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function viewDoc() {
    setError(null);
    startTransition(async () => {
      const res = await kycSignedUrlAction({ submissionId });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      window.open(res.url, "_blank", "noopener,noreferrer");
    });
  }

  function review(decision: "APPROVE" | "REJECT") {
    setError(null);
    startTransition(async () => {
      const res = await reviewKycAction({ submissionId, decision });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="outline" onClick={viewDoc} disabled={isPending}>
          View document
        </Button>
        <Button type="button" size="sm" onClick={() => review("APPROVE")} disabled={isPending}>
          Approve
        </Button>
        <Button type="button" size="sm" variant="destructive" onClick={() => review("REJECT")} disabled={isPending}>
          Reject
        </Button>
      </div>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
