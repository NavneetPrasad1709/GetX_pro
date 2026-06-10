"use client";

import { useState, useTransition } from "react";
import { updateEmailPreferenceAction } from "@/server/actions/notifications";
import { cn } from "@/lib/utils";

/**
 * Email-notifications on/off switch (Step 22). Optimistic flip backed by the
 * server action; reverts + surfaces an error if the write fails. In-app and
 * realtime notifications are unaffected by this toggle.
 */
export function EmailNotificationsToggle({ initialEnabled }: { initialEnabled: boolean }) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const toggle = () => {
    const next = !enabled;
    setEnabled(next);
    setError(null);
    startTransition(async () => {
      const res = await updateEmailPreferenceAction({ enabled: next });
      if (!res.ok) {
        setEnabled(!next); // revert
        setError(res.error);
      }
    });
  };

  return (
    <div className="flex items-center justify-between gap-4 rounded-xl border border-border bg-card p-4">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-foreground">Email notifications</p>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Order updates, new messages, payouts and disputes by email. In-app
          notifications stay on either way.
        </p>
        {error ? <p className="mt-1 text-sm text-destructive">{error}</p> : null}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        aria-label="Email notifications"
        onClick={toggle}
        disabled={pending}
        className={cn(
          "relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none disabled:opacity-60",
          enabled ? "bg-primary-strong" : "bg-muted",
        )}
      >
        <span
          aria-hidden="true"
          className={cn(
            "inline-block size-5 transform rounded-full bg-white shadow transition-transform",
            enabled ? "translate-x-[22px]" : "translate-x-0.5",
          )}
        />
      </button>
    </div>
  );
}
