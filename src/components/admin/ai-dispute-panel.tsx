"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { SparklesIcon } from "lucide-react";
import { acceptAiVerdictAction, overrideAiVerdictAction } from "@/server/actions/admin";
import type { DisputeAi } from "@/server/services/admin";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

/**
 * AI Dispute Judge panel (Step 25). Shows the AI's suggested verdict, confidence
 * and reasoning. The admin can ACCEPT it (1-click) or OVERRIDE it with a reason —
 * both move money through the same escrow ledger as a manual resolution.
 */
const VERDICT_LABEL = { BUYER: "Refund buyer", SELLER: "Release to seller" } as const;

export function AiDisputePanel({
  ai,
  resolved,
}: {
  ai: DisputeAi;
  resolved: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [showOverride, setShowOverride] = useState(false);
  const [overrideVerdict, setOverrideVerdict] = useState<"BUYER" | "SELLER">("BUYER");
  const [reason, setReason] = useState("");
  const [isPending, startTransition] = useTransition();

  // Not judged yet (AI dormant or background job hasn't run).
  if (!ai.judgedAt || !ai.verdict) {
    return (
      <section className="rounded-lg border border-border bg-card/40 p-4">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold">
          <SparklesIcon className="size-4 text-primary" aria-hidden="true" /> AI Analysis
        </h2>
        <p className="mt-1.5 text-xs text-muted-foreground">
          No AI verdict yet. The Dispute Judge runs in the background when the AI key is
          configured — resolve manually below otherwise.
        </p>
      </section>
    );
  }

  const confidence = ai.confidence ?? 0;
  const lowConfidence = confidence < 70;
  const isSeller = ai.verdict === "SELLER";
  const autoResolved = ai.judgeActorType === "AI";

  function accept() {
    setError(null);
    startTransition(async () => {
      const res = await acceptAiVerdictAction({ disputeId: ai.disputeId });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.refresh();
    });
  }

  function submitOverride() {
    setError(null);
    if (reason.trim().length < 3) {
      setError("Add a short reason for the override.");
      return;
    }
    startTransition(async () => {
      const res = await overrideAiVerdictAction({
        disputeId: ai.disputeId,
        verdict: overrideVerdict,
        reason: reason.trim(),
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <section className="rounded-lg border border-primary/30 bg-primary/5 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold">
          <SparklesIcon className="size-4 text-primary" aria-hidden="true" /> AI Analysis
        </h2>
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
            isSeller
              ? "bg-success/15 text-success"
              : "bg-amber-500/15 text-amber-600 dark:text-amber-400"
          }`}
        >
          {VERDICT_LABEL[ai.verdict]}
        </span>
      </div>

      {autoResolved ? (
        <p className="mt-2 rounded-md border border-success/30 bg-success/10 px-2.5 py-1.5 text-xs font-medium text-success">
          Auto-resolved by AI at {confidence}% confidence. You can still override below.
        </p>
      ) : null}

      {/* confidence bar */}
      <div className="mt-3">
        <div className="flex items-center justify-between text-xs">
          <span className="text-faint">Confidence</span>
          <span className="font-semibold tabular-nums">{confidence}%</span>
        </div>
        <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-border">
          <div
            className={`h-full rounded-full ${lowConfidence ? "bg-amber-500" : "bg-primary"}`}
            style={{ width: `${Math.max(0, Math.min(100, confidence))}%` }}
          />
        </div>
        {lowConfidence ? (
          <span className="mt-1.5 inline-block rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-semibold text-amber-600 dark:text-amber-400">
            Needs Review
          </span>
        ) : null}
      </div>

      {ai.reasoning ? (
        <p className="mt-3 text-sm break-words whitespace-pre-line text-muted-foreground">
          {ai.reasoning}
        </p>
      ) : null}

      {ai.keyFacts.length > 0 ? (
        <ul className="mt-2 list-disc space-y-0.5 pl-5 text-xs text-muted-foreground">
          {ai.keyFacts.map((f, i) => (
            <li key={i}>{f}</li>
          ))}
        </ul>
      ) : null}

      {error ? <p className="mt-2 text-xs text-destructive">{error}</p> : null}

      {/* actions */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {!resolved ? (
          <Button type="button" size="sm" onClick={accept} disabled={isPending}>
            Accept ({VERDICT_LABEL[ai.verdict]})
          </Button>
        ) : null}
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => setShowOverride((v) => !v)}
          disabled={isPending}
        >
          {showOverride ? "Cancel override" : "Override"}
        </Button>
      </div>

      {showOverride ? (
        <div className="mt-3 flex flex-col gap-2 rounded-md border border-border bg-card p-3">
          <div className="flex gap-2" role="group" aria-label="Override verdict">
            {(["BUYER", "SELLER"] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setOverrideVerdict(v)}
                className={`flex-1 rounded-md border px-2 py-1.5 text-xs font-semibold transition-colors ${
                  overrideVerdict === v
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:border-primary/40"
                }`}
              >
                {VERDICT_LABEL[v]}
              </button>
            ))}
          </div>
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            maxLength={500}
            disabled={isPending}
            placeholder="Why are you overriding the AI? (recorded in the audit log)…"
            aria-label="Override reason"
          />
          <Button type="button" size="sm" variant="destructive" onClick={submitOverride} disabled={isPending}>
            Confirm override
          </Button>
        </div>
      ) : null}
    </section>
  );
}
