"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  markPayoutFailedAction,
  markPayoutPaidAction,
} from "@/server/actions/payouts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * Admin payout processing (Step 14). "Mark paid" confirms the money was sent;
 * "Fail + reverse" marks it FAILED and the service reverses the reserved funds
 * (CREDIT back). Both are idempotent server-side (status CAS).
 */
export function PayoutActions({ payoutId }: { payoutId: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<"idle" | "failing">("idle");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function markPaid() {
    setError(null);
    startTransition(async () => {
      const res = await markPayoutPaidAction({ payoutId });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.refresh();
    });
  }

  function markFailed(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (reason.trim().length < 1) {
      setError("Add a reason.");
      return;
    }
    startTransition(async () => {
      const res = await markPayoutFailedAction({ payoutId, reason: reason.trim() });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-2">
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
      {mode === "idle" ? (
        <div className="flex gap-2">
          <Button type="button" size="sm" onClick={markPaid} disabled={isPending}>
            Mark paid
          </Button>
          <Button
            type="button"
            size="sm"
            variant="destructive"
            onClick={() => setMode("failing")}
            disabled={isPending}
          >
            Fail + reverse
          </Button>
        </div>
      ) : (
        <form onSubmit={markFailed} className="flex flex-col gap-2 min-[521px]:flex-row">
          <Input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Reason (e.g. invalid bank details)"
            disabled={isPending}
            className="min-[521px]:w-56"
          />
          <div className="flex gap-2">
            <Button type="submit" size="sm" variant="destructive" disabled={isPending}>
              {isPending ? "…" : "Confirm fail"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => {
                setMode("idle");
                setReason("");
                setError(null);
              }}
              disabled={isPending}
            >
              Cancel
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
