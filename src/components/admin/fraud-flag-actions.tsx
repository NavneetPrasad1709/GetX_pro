"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { dismissFraudFlag, actionFraudFlag } from "@/server/actions/fraud";

const ACTIONS = [
  { value: "BAN_USER", label: "Ban user" },
  { value: "REMOVE_LISTING", label: "Remove listing" },
  { value: "HOLD_PAYOUT", label: "Hold payout" },
  { value: "FORCE_RE_KYC", label: "Force re-KYC" },
] as const;

/** Dismiss / action a fraud flag from the admin queue (Prompt 16). */
export function FraudFlagActions({
  flagId,
  isCritical,
}: {
  flagId: string;
  isCritical: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState<null | "dismiss" | "action">(null);
  const [note, setNote] = useState("");
  const [action, setAction] = useState<(typeof ACTIONS)[number]["value"]>("BAN_USER");
  const [pending, startTransition] = useTransition();

  function run(p: Promise<{ ok: boolean; error?: string }>, okMsg: string) {
    startTransition(async () => {
      const res = await p;
      if (res.ok) {
        toast.success(okMsg);
        setOpen(null);
        setNote("");
        router.refresh();
      } else {
        toast.error(res.error ?? "Failed.");
      }
    });
  }

  if (open === null) {
    return (
      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={() => setOpen("dismiss")}
          className="rounded-sm border border-border px-2.5 py-1 text-xs font-semibold hover:border-primary/40 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          Dismiss
        </button>
        <button
          type="button"
          onClick={() => setOpen("action")}
          className="rounded-sm border border-destructive/40 px-2.5 py-1 text-xs font-semibold text-destructive hover:bg-destructive/10 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          Action
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5 rounded-md border border-border bg-card p-2.5">
      {open === "action" ? (
        <select
          value={action}
          onChange={(e) => setAction(e.target.value as typeof action)}
          disabled={pending}
          className="rounded-sm border border-input bg-background px-2 py-1 text-xs"
        >
          {ACTIONS.map((a) => (
            <option key={a.value} value={a.value}>
              {a.label}
            </option>
          ))}
        </select>
      ) : null}
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={2}
        disabled={pending}
        placeholder={
          open === "dismiss" && isCritical
            ? "Why is this a false positive? (min 20 chars)"
            : "Review note"
        }
        className="w-full rounded-sm border border-input bg-background px-2 py-1 text-xs"
      />
      <div className="flex gap-1.5">
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            open === "dismiss"
              ? run(dismissFraudFlag({ flagId, note }), "Flag dismissed.")
              : run(actionFraudFlag({ flagId, action, note }), "Action applied.")
          }
          className="rounded-sm bg-primary px-2.5 py-1 text-xs font-semibold text-primary-foreground disabled:opacity-60"
        >
          {pending ? "Working…" : open === "dismiss" ? "Confirm dismiss" : "Apply action"}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            setOpen(null);
            setNote("");
          }}
          className="rounded-sm border border-border px-2.5 py-1 text-xs font-semibold disabled:opacity-60"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
