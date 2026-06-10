"use client";

import { useState } from "react";
import { CopyIcon, CheckIcon, StarIcon } from "lucide-react";

/**
 * Seller-side "ask your buyer for a review" nudge (Prompt 14). Shown on the
 * seller's view of a COMPLETED order that has no review yet. The message is a
 * fixed, copy-pasteable string the seller sends via the existing chat — no new
 * action, no user-generated content rendered.
 */
const MESSAGE =
  "Hi! Thanks for your order. If you're happy with the purchase, a review on GETX would mean a lot to my shop. It only takes 30 seconds. 🙏";

export function AskForReview() {
  const [copied, setCopied] = useState(false);

  function copy() {
    navigator.clipboard?.writeText(MESSAGE).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      },
      () => {
        /* clipboard blocked — the seller can still select the text manually */
      },
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="flex items-center gap-2 text-sm font-semibold">
        <StarIcon className="size-4 text-primary" aria-hidden="true" />
        Ask your buyer for a review
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        Reviews build your trust score and win you more sales. Send this via chat:
      </p>
      <p className="mt-2.5 rounded-md border border-border bg-background p-3 text-[13px] text-foreground">
        {MESSAGE}
      </p>
      <button
        type="button"
        onClick={copy}
        className="mt-2.5 inline-flex items-center gap-1.5 rounded-sm text-xs font-semibold text-primary hover:text-primary-hover focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        {copied ? (
          <>
            <CheckIcon className="size-3.5" aria-hidden="true" />
            Copied!
          </>
        ) : (
          <>
            <CopyIcon className="size-3.5" aria-hidden="true" />
            Copy message
          </>
        )}
      </button>
    </div>
  );
}
