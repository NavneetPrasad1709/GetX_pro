"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { resolveDisputeAction } from "@/server/actions/admin";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

/**
 * Dispute resolution (Step 15). Both outcomes move money via the escrow ledger
 * in one transaction: "Refund buyer" reverses the hold, "Release to seller"
 * pays out. Idempotent server-side (an already-resolved dispute is rejected).
 */
export function DisputeResolveActions({ orderId }: { orderId: string }) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function resolve(outcome: "REFUND_BUYER" | "RELEASE_SELLER") {
    setError(null);
    if (note.trim().length < 1) {
      setError("Add a short resolution note first.");
      return;
    }
    startTransition(async () => {
      const res = await resolveDisputeAction({ orderId, outcome, note: note.trim() });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <Textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={2}
        maxLength={500}
        disabled={isPending}
        placeholder="Resolution note (recorded in the audit log)…"
        aria-label="Resolution note"
      />
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="destructive" onClick={() => resolve("REFUND_BUYER")} disabled={isPending}>
          Refund buyer
        </Button>
        <Button type="button" size="sm" onClick={() => resolve("RELEASE_SELLER")} disabled={isPending}>
          Release to seller
        </Button>
      </div>
    </div>
  );
}
