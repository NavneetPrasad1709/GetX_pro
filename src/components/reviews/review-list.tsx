import { BadgeCheckIcon } from "lucide-react";
import { Rating } from "@/components/shared/rating";
import { UserAvatar } from "@/components/shared/user-avatar";
import { SellerReplyForm } from "@/components/reviews/seller-reply-form";
import type { ReviewItem } from "@/server/services/reviews";

/**
 * Presentational review feed (Step 13). Each item carries a "Verified purchase"
 * badge (every review is gated to a completed order), the rating, date, comment,
 * and the seller's reply. When `canReply` is set (the viewer is the seller), a
 * reply form appears on reviews that don't have one yet. Text is React-escaped.
 */

const dateFmt = new Intl.DateTimeFormat("en-US", { dateStyle: "medium" });

export function ReviewList({
  reviews,
  canReply = false,
}: {
  reviews: ReviewItem[];
  canReply?: boolean;
}) {
  return (
    <ul className="flex flex-col gap-3">
      {reviews.map((r) => (
        <li key={r.id} className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-start gap-3">
            <UserAvatar name={r.reviewerName} image={r.reviewerImage} size="sm" />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold">{r.reviewerName}</span>
                <span className="inline-flex items-center gap-1 rounded-full bg-success/12 px-1.5 py-0.5 text-[10px] font-semibold text-success">
                  <BadgeCheckIcon className="size-3" aria-hidden="true" />
                  Verified purchase
                </span>
              </div>

              <div className="mt-1 flex flex-wrap items-center gap-2">
                <Rating value={r.rating} showValue={false} />
                <span className="text-xs text-faint">
                  {dateFmt.format(new Date(r.createdAt))}
                  {r.edited ? " · edited" : ""}
                </span>
              </div>

              {r.comment ? (
                <p className="mt-2 text-sm break-words whitespace-pre-line text-muted-foreground">
                  {r.comment}
                </p>
              ) : null}

              {r.sellerReply ? (
                <div className="mt-3 rounded-md border-l-2 border-primary/40 bg-muted/40 p-3">
                  <p className="text-xs font-semibold text-primary-hover">
                    Seller&apos;s reply
                  </p>
                  <p className="mt-1 text-sm break-words whitespace-pre-line text-muted-foreground">
                    {r.sellerReply}
                  </p>
                </div>
              ) : canReply ? (
                <SellerReplyForm reviewId={r.id} />
              ) : null}
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
