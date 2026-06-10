"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { StarIcon } from "lucide-react";
import { StarInput } from "@/components/reviews/star-input";
import { Textarea } from "@/components/ui/textarea";
import { ctaVariants } from "@/components/shared/cta-link";
import {
  editReviewAction,
  submitReviewAction,
} from "@/server/actions/reviews";
import { MAX_REVIEW_COMMENT } from "@/lib/validators/review";
import { cn } from "@/lib/utils";

/**
 * Buyer review form (Step 13). Posts a new review for a COMPLETED order, or
 * edits the existing one. The server re-checks eligibility + one-per-order.
 */
export function ReviewForm({
  orderId,
  reviewId,
  initialRating = 0,
  initialComment,
}: {
  orderId: string;
  reviewId?: string;
  initialRating?: number;
  initialComment?: string | null;
}) {
  const router = useRouter();
  const isEdit = Boolean(reviewId);
  const [rating, setRating] = useState(initialRating);
  const [comment, setComment] = useState(initialComment ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (rating < 1) {
      setError("Pick a star rating first.");
      return;
    }
    startTransition(async () => {
      const res = isEdit
        ? await editReviewAction({ reviewId, rating, comment })
        : await submitReviewAction({ orderId, rating, comment });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <form
      onSubmit={submit}
      className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4"
    >
      <div className="flex items-center gap-2 text-sm font-semibold">
        <StarIcon className="size-4 text-star" aria-hidden="true" />
        {isEdit ? "Edit your review" : "Rate this order"}
      </div>
      <p className="text-xs text-muted-foreground">
        Your honest review helps other buyers trade safely.
      </p>

      <StarInput value={rating} onChange={setRating} disabled={isPending} />

      <Textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        maxLength={MAX_REVIEW_COMMENT}
        rows={3}
        disabled={isPending}
        placeholder="Was it as described? Fast delivery? Anything other buyers should know… (optional)"
        aria-label="Review comment"
      />

      {error ? (
        <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={isPending}
        className={cn(ctaVariants(), "w-full disabled:opacity-60")}
      >
        {isPending ? "Posting…" : isEdit ? "Save review" : "Post review"}
      </button>
    </form>
  );
}
