"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { sponsorSellerAction } from "@/server/actions/monetization";

/** Buy/extend a weekly spotlight slot (Prompt 15b, Stream 3). */
export function SponsorButton({ isActive }: { isActive: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function sponsor() {
    startTransition(async () => {
      const res = await sponsorSellerAction();
      if (res.ok) {
        toast.success(isActive ? "Spotlight extended by 7 days!" : "You're in the spotlight!");
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <button
      type="button"
      onClick={sponsor}
      disabled={pending}
      className="inline-flex items-center justify-center rounded-sm bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-strong disabled:opacity-60 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
    >
      {pending ? "Processing…" : isActive ? "Extend spotlight" : "Get spotlight"}
    </button>
  );
}
