"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { RocketIcon } from "lucide-react";
import { siteConfig } from "@/config/site";
import { formatMoney } from "@/lib/money";
import { boostListingAction } from "@/server/actions/monetization";

/**
 * Boost ("Promote") a listing for a day or a week (Prompt 15). Inline expanding
 * control — no modal dependency, mobile-friendly. The fee is deducted from the
 * seller's available wallet balance by the server action.
 */
export function BoostListingButton({
  listingId,
  active,
}: {
  listingId: string;
  /** Whether a paid boost is currently live — computed server-side (no Date.now in render). */
  active: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const { dailyFeeMinor, weeklyFeeMinor } = siteConfig.fees.boost;

  function buy(duration: "daily" | "weekly") {
    startTransition(async () => {
      const res = await boostListingAction({ listingId, duration });
      if (res.ok) {
        toast.success(active ? "Boost extended!" : "Listing promoted!");
        setOpen(false);
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-sm border border-border px-2.5 py-1.5 text-xs font-semibold transition-colors hover:border-primary/40 hover:text-primary focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        <RocketIcon className="size-3.5 text-primary" aria-hidden="true" />
        {active ? "Extend boost" : "Boost"}
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-1.5 rounded-md border border-primary/30 bg-primary/5 p-2.5">
      <p className="text-[11px] text-muted-foreground">
        Feature this listing in the Promoted row. Deducted from your wallet.
      </p>
      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={() => buy("daily")}
          disabled={pending}
          className="rounded-sm bg-primary px-2.5 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-60"
        >
          1 day · {formatMoney(dailyFeeMinor, "INR")}
        </button>
        <button
          type="button"
          onClick={() => buy("weekly")}
          disabled={pending}
          className="rounded-sm bg-primary px-2.5 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-60"
        >
          7 days · {formatMoney(weeklyFeeMinor, "INR")}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          disabled={pending}
          className="rounded-sm border border-border px-2.5 py-1.5 text-xs font-semibold disabled:opacity-60"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
