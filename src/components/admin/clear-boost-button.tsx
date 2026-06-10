"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { clearListingBoostAction } from "@/server/actions/admin";

/** Admin force-clear of a listing's paid boost (Prompt 15 anti-abuse recourse). */
export function ClearBoostButton({ listingId }: { listingId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function clear() {
    startTransition(async () => {
      const res = await clearListingBoostAction({ listingId });
      if (res.ok) {
        toast.success("Boost cleared.");
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <button
      type="button"
      onClick={clear}
      disabled={pending}
      className="rounded-sm border border-warning/40 px-2.5 py-1.5 text-xs font-semibold text-warning transition-colors hover:bg-warning/10 disabled:opacity-60 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
    >
      {pending ? "Clearing…" : "Clear boost"}
    </button>
  );
}
