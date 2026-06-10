"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PackageCheckIcon } from "lucide-react";
import { markDeliveredAction } from "@/server/actions/escrow";
import { Textarea } from "@/components/ui/textarea";
import { ctaVariants } from "@/components/shared/cta-link";
import { MAX_DELIVERY_CHARS } from "@/lib/validators/escrow";
import { siteConfig } from "@/config/site";
import { cn } from "@/lib/utils";

/**
 * Seller deliver island (Step 10). Shown only to the order's seller on a PAID
 * order. Sends { orderId, content } to markDeliveredAction; the server re-checks
 * ownership + the PAID → DELIVERED transition. On success the page revalidates
 * and flips to the "delivered, awaiting confirmation" state.
 */
export function DeliverForm({ orderId }: { orderId: string }) {
  const router = useRouter();
  const errorId = useId();
  const [content, setContent] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    const trimmed = content.trim();
    if (!trimmed) {
      setError("Add the delivery details before sending.");
      return;
    }
    startTransition(async () => {
      const res = await markDeliveredAction({ orderId, content: trimmed });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setContent("");
      router.refresh();
    });
  }

  return (
    <form
      onSubmit={submit}
      className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4"
    >
      <div className="flex items-center gap-2 text-sm font-semibold">
        <PackageCheckIcon className="size-4 text-primary" aria-hidden="true" />
        Deliver this order
      </div>
      <p className="text-xs text-muted-foreground">
        Send the account login, redemption code or step-by-step instructions.
        Only the buyer and GETX support can ever read this.
      </p>

      <label htmlFor="delivery-content" className="sr-only">
        Delivery details
      </label>
      <Textarea
        id="delivery-content"
        value={content}
        onChange={(event) => setContent(event.target.value)}
        maxLength={MAX_DELIVERY_CHARS}
        disabled={isPending}
        required
        rows={5}
        placeholder={"Login: …\nPassword: …\nRecovery email: …\nNotes: …"}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
      />

      {error ? (
        <p
          id={errorId}
          role="alert"
          className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive"
        >
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={isPending}
        className={cn(ctaVariants({ size: "lg" }), "w-full disabled:opacity-60")}
      >
        {isPending ? "Delivering…" : "Mark as delivered"}
      </button>

      <p className="text-center text-xs text-faint">
        The buyer has {siteConfig.escrow.autoReleaseDays} days to confirm — after
        that the payment auto-releases to you.
      </p>
    </form>
  );
}
