"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

const RANGES = [7, 30, 90] as const;

/** 7d / 30d / 90d range switcher — navigates to ?days=X (Step 20). */
export function DateRangePicker({ active }: { active: number }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <div
      role="group"
      aria-label="Date range"
      className="inline-flex rounded-lg border border-border bg-card p-0.5"
    >
      {RANGES.map((d) => (
        <button
          key={d}
          type="button"
          disabled={pending}
          aria-pressed={active === d}
          onClick={() => startTransition(() => router.push(`/seller/analytics?days=${d}`))}
          className={cn(
            "rounded-md px-3 py-1.5 font-heading text-sm font-semibold transition-colors disabled:opacity-60",
            active === d
              ? "bg-primary-strong text-primary-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {d}d
        </button>
      ))}
    </div>
  );
}
