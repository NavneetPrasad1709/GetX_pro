"use client";

import { useEffect, useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2Icon, ShieldAlertIcon } from "lucide-react";
import {
  confirmReceiptAction,
  openDisputeAction,
} from "@/server/actions/escrow";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ctaVariants } from "@/components/shared/cta-link";
import { MAX_DISPUTE_CHARS } from "@/lib/validators/escrow";
import { cn } from "@/lib/utils";

/**
 * Buyer confirm / dispute island (Step 10). Shown only to the buyer on a
 * DELIVERED order. Two paths:
 *   • Confirm received  → releaseReceiptAction → escrow releases to the seller now.
 *   • Open a dispute    → openDisputeAction → freezes release for admin review.
 * A live countdown (mounted client-only to avoid hydration drift) reminds the
 * buyer that the payment auto-releases on `deadlineLabel` if they do nothing.
 */

function formatRemaining(ms: number): string {
  if (ms <= 0) return "any moment now";
  const totalMinutes = Math.floor(ms / 60_000);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

export function ConfirmReceipt({
  orderId,
  autoReleaseAtMs,
  deadlineLabel,
}: {
  orderId: string;
  autoReleaseAtMs: number;
  deadlineLabel: string;
}) {
  const router = useRouter();
  const errorId = useId();
  const [remaining, setRemaining] = useState<string | null>(null);
  const [mode, setMode] = useState<"idle" | "disputing">("idle");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<"confirm" | "dispute" | null>(
    null,
  );
  const [isPending, startTransition] = useTransition();

  // Live countdown — client-only so the server/client first paint can't disagree.
  useEffect(() => {
    const tick = () => setRemaining(formatRemaining(autoReleaseAtMs - Date.now()));
    tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, [autoReleaseAtMs]);

  function confirm() {
    setError(null);
    setPendingAction("confirm");
    startTransition(async () => {
      const res = await confirmReceiptAction({ orderId });
      setPendingAction(null);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.refresh();
    });
  }

  function submitDispute(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    const trimmed = reason.trim();
    if (trimmed.length < 10) {
      setError("Tell us what went wrong (at least 10 characters).");
      return;
    }
    setPendingAction("dispute");
    startTransition(async () => {
      const res = await openDisputeAction({ orderId, reason: trimmed });
      setPendingAction(null);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-primary/30 bg-primary/5 p-4">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <CheckCircle2Icon className="size-4 text-primary" aria-hidden="true" />
        All good? Release the payment
      </div>
      <p className="text-xs text-muted-foreground">
        Check the delivered details actually work before confirming.{" "}
        <span className="font-semibold text-foreground">You are protected</span>{" "}
        until <span className="font-medium text-foreground">{deadlineLabel}</span>
        {remaining ? (
          <>
            {" "}
            <span className="text-faint">(in {remaining})</span>
          </>
        ) : null}{" "}
        — if anything is wrong, open a dispute before the deadline and your
        payment is frozen for review.
      </p>

      {error ? (
        <p
          id={errorId}
          role="alert"
          className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive"
        >
          {error}
        </p>
      ) : null}

      {mode === "idle" ? (
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={confirm}
            disabled={isPending}
            className={cn(ctaVariants({ size: "lg" }), "w-full disabled:opacity-60")}
          >
            {pendingAction === "confirm"
              ? "Releasing…"
              : "Confirm received & release payment"}
          </button>
          <button
            type="button"
            onClick={() => {
              setMode("disputing");
              setError(null);
            }}
            disabled={isPending}
            className="text-center text-xs font-semibold text-muted-foreground transition-colors hover:text-destructive disabled:opacity-60"
          >
            Something wrong? Open a dispute
          </button>
        </div>
      ) : (
        <form onSubmit={submitDispute} className="flex flex-col gap-2">
          <label
            htmlFor="dispute-reason"
            className="flex items-center gap-1.5 text-sm font-semibold"
          >
            <ShieldAlertIcon className="size-4 text-destructive" aria-hidden="true" />
            What went wrong?
          </label>
          <Textarea
            id="dispute-reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            maxLength={MAX_DISPUTE_CHARS}
            rows={4}
            disabled={isPending}
            required
            placeholder="Wrong details, account locked, not as described…"
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : undefined}
          />
          <div className="flex gap-2">
            <Button
              type="submit"
              variant="destructive"
              size="lg"
              disabled={isPending}
              className="flex-1"
            >
              {pendingAction === "dispute" ? "Opening…" : "Open dispute"}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="lg"
              disabled={isPending}
              onClick={() => {
                setMode("idle");
                setReason("");
                setError(null);
              }}
            >
              Cancel
            </Button>
          </div>
          <p className="text-xs text-faint">
            Opening a dispute freezes the payment. Our team reviews within 48
            hours.
          </p>
        </form>
      )}
    </div>
  );
}
