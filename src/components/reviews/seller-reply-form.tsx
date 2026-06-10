"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { replyToReviewAction } from "@/server/actions/reviews";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { MAX_SELLER_REPLY } from "@/lib/validators/review";

/**
 * Seller's one-time public reply to a review (Step 13). Only rendered when the
 * viewer is the reviewed seller and the review has no reply yet; the server
 * re-checks ownership.
 */
export function SellerReplyForm({ reviewId }: { reviewId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reply, setReply] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-2 text-xs font-semibold text-primary hover:text-primary-hover"
      >
        Reply to this review
      </button>
    );
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (reply.trim().length < 1) {
      setError("Write a reply first.");
      return;
    }
    startTransition(async () => {
      const res = await replyToReviewAction({ reviewId, reply: reply.trim() });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} className="mt-3 flex flex-col gap-2">
      <Textarea
        value={reply}
        onChange={(e) => setReply(e.target.value)}
        maxLength={MAX_SELLER_REPLY}
        rows={2}
        disabled={isPending}
        placeholder="Thanks for the feedback…"
        aria-label="Your reply"
      />
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={isPending}>
          {isPending ? "Posting…" : "Post reply"}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={isPending}
          onClick={() => {
            setOpen(false);
            setReply("");
            setError(null);
          }}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
