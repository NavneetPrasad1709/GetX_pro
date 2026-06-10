"use client";

import { useState, useTransition } from "react";
import { ReviewList } from "@/components/reviews/review-list";
import { loadMoreReviewsAction } from "@/server/actions/reviews";
import { Button } from "@/components/ui/button";
import type { ReviewItem } from "@/server/services/reviews";

/**
 * Paginated review feed (Step 13) — initial page rendered server-side, "Load
 * more" appends the next cursor page. `canReply` (viewer is the seller) applies
 * to every page.
 */
export function ReviewsFeed({
  sellerId,
  initial,
  initialCursor,
  canReply,
}: {
  sellerId: string;
  initial: ReviewItem[];
  initialCursor: string | null;
  canReply: boolean;
}) {
  const [reviews, setReviews] = useState(initial);
  const [cursor, setCursor] = useState(initialCursor);
  const [isPending, startTransition] = useTransition();

  function loadMore() {
    if (!cursor) return;
    startTransition(async () => {
      const res = await loadMoreReviewsAction(sellerId, cursor);
      if (res.ok) {
        // De-dupe defensively in case a review was inserted between pages.
        setReviews((prev) => {
          const seen = new Set(prev.map((r) => r.id));
          return [...prev, ...res.reviews.filter((r) => !seen.has(r.id))];
        });
        setCursor(res.nextCursor);
      }
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <ReviewList reviews={reviews} canReply={canReply} />
      {cursor ? (
        <Button
          type="button"
          variant="outline"
          onClick={loadMore}
          disabled={isPending}
          className="self-center"
        >
          {isPending ? "Loading…" : "Load more reviews"}
        </Button>
      ) : null}
    </div>
  );
}
