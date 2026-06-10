"use client";

import { useState, useTransition } from "react";
import { HeartIcon } from "lucide-react";
import { toggleGuideLikeAction } from "@/server/actions/guides";
import { cn } from "@/lib/utils";

/** Optimistic like toggle for a guide (Step 27). Server re-checks auth + persists. */
export function GuideLikeButton({
  guideId,
  initialCount,
}: {
  guideId: string;
  initialCount: number;
}) {
  const [liked, setLiked] = useState(false);
  const [count, setCount] = useState(initialCount);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function toggle() {
    setError(null);
    // optimistic
    const nextLiked = !liked;
    setLiked(nextLiked);
    setCount((c) => c + (nextLiked ? 1 : -1));
    startTransition(async () => {
      const res = await toggleGuideLikeAction(guideId);
      if (!res.ok) {
        // revert
        setLiked(!nextLiked);
        setCount((c) => c + (nextLiked ? -1 : 1));
        setError(res.error);
        return;
      }
      setLiked(res.liked ?? nextLiked);
    });
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={toggle}
        disabled={pending}
        aria-pressed={liked}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-semibold transition-colors disabled:opacity-60 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
          liked ? "border-primary/40 bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground",
        )}
      >
        <HeartIcon className={cn("size-4", liked && "fill-current")} aria-hidden="true" />
        {count}
      </button>
      {error ? <span className="text-xs text-destructive">{error}</span> : null}
    </div>
  );
}
