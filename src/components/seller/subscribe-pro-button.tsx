"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { subscribeProAction } from "@/server/actions/monetization";

/**
 * Subscribe to / extend GETX Pro (Prompt 15). Fee is deducted from the seller's
 * available wallet balance by the server action.
 */
export function SubscribeProButton({
  isActive,
  className,
  label,
}: {
  isActive: boolean;
  className?: string;
  label?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function subscribe() {
    startTransition(async () => {
      const res = await subscribeProAction();
      if (res.ok) {
        toast.success(isActive ? "GETX Pro extended by 30 days!" : "Welcome to GETX Pro!");
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <button
      type="button"
      onClick={subscribe}
      disabled={pending}
      className={
        className ??
        "inline-flex items-center justify-center rounded-sm bg-primary px-5 py-2.5 font-heading text-sm font-bold text-primary-foreground transition-colors hover:bg-primary-strong disabled:opacity-60 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
      }
    >
      {pending
        ? "Processing…"
        : label ?? (isActive ? "Extend Pro (30 days)" : "Upgrade to Pro")}
    </button>
  );
}
