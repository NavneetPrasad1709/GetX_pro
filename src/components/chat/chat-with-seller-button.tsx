"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MessageCircleIcon } from "lucide-react";
import { openConversationAction } from "@/server/actions/chat";
import { cn } from "@/lib/utils";

/**
 * "Chat with seller" / "Chat about this order" island (Step 11). Opens or finds
 * the conversation via the server action, then navigates to it. The server
 * resolves participants + blocks self-chat; this only triggers + routes.
 */
export function ChatWithSellerButton({
  sellerProfileId,
  orderId,
  label = "Chat with seller",
  className,
}: {
  sellerProfileId?: string;
  orderId?: string;
  label?: string;
  className?: string;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function open() {
    setError(null);
    startTransition(async () => {
      const res = await openConversationAction(
        sellerProfileId ? { sellerProfileId } : { orderId },
      );
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.push(`/messages/${res.conversationId}`);
    });
  }

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <button
        type="button"
        onClick={open}
        disabled={isPending}
        className="inline-flex w-full items-center justify-center gap-2 rounded-sm border border-border bg-background px-4 py-2.5 font-heading text-sm font-semibold transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none disabled:opacity-60"
      >
        <MessageCircleIcon className="size-4" aria-hidden="true" />
        {isPending ? "Opening…" : label}
      </button>
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
