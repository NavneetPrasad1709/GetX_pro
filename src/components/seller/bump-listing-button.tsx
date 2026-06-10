"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowUpIcon } from "lucide-react";
import { siteConfig } from "@/config/site";
import { formatMoney } from "@/lib/money";
import { bumpListingAction } from "@/server/actions/monetization";

/**
 * One-tap listing "bump" (Prompt 15b, Stream 7) — pushes the listing to the top
 * of the newest sort for a flat fee, deducted from the wallet. Max 3/day enforced
 * server-side.
 */
export function BumpListingButton({ listingId }: { listingId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function bump() {
    startTransition(async () => {
      const res = await bumpListingAction({ listingId });
      if (res.ok) {
        toast.success("Listing bumped to the top of Newest!");
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <button
      type="button"
      onClick={bump}
      disabled={pending}
      title={`Bump to top · ${formatMoney(siteConfig.fees.boost.bumpFeeMinor, "INR")}`}
      className="inline-flex items-center gap-1.5 rounded-sm border border-border px-2.5 py-1.5 text-xs font-semibold transition-colors hover:border-primary/40 hover:text-primary disabled:opacity-60 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
    >
      <ArrowUpIcon className="size-3.5 text-primary" aria-hidden="true" />
      {pending ? "Bumping…" : `Bump · ${formatMoney(siteConfig.fees.boost.bumpFeeMinor, "INR")}`}
    </button>
  );
}
