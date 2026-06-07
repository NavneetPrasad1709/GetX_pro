"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  PauseIcon,
  PencilIcon,
  PlayIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react";
import type { ListingStatus } from "@prisma/client";
import {
  removeListingAction,
  setListingStatusAction,
} from "@/server/actions/listings";
import { Button } from "@/components/ui/button";

/**
 * Per-listing action buttons (manage page). Remove is two-step inline confirm
 * (no modal): first tap arms it, second tap inside 5s actually removes.
 */
export function ListingActions({
  listingId,
  status,
}: {
  listingId: string;
  status: ListingStatus;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [armed, setArmed] = useState(false);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const groupRef = useRef<HTMLSpanElement>(null);

  // Arming swaps the buttons — move focus onto "Confirm remove" so keyboard/
  // screen-reader users land on the new step instead of falling to <body>
  // (focusing the button also announces it). Auto-disarm after 5s, but NEVER
  // while focus is inside the confirm group (a control must not vanish
  // mid-interaction under AT users).
  useEffect(() => {
    if (!armed) return;
    confirmRef.current?.focus();
    const timer = setInterval(() => {
      if (!groupRef.current?.contains(document.activeElement)) {
        setArmed(false);
      }
    }, 5000);
    return () => clearInterval(timer);
  }, [armed]);

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, done: string) {
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) {
        toast.error(res.error ?? "Something went wrong.");
        return;
      }
      toast.success(done);
      router.refresh();
    });
  }

  const editable = status === "DRAFT" || status === "ACTIVE" || status === "PAUSED";

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {editable && (
        <Button
          variant="outline"
          size="sm"
          render={<Link href={`/seller/listings/${listingId}/edit`} />}
        >
          <PencilIcon data-icon="inline-start" aria-hidden="true" />
          Edit
        </Button>
      )}

      {(status === "DRAFT" || status === "PAUSED") && (
        <Button
          variant="outline"
          size="sm"
          disabled={pending}
          onClick={() =>
            run(
              () => setListingStatusAction({ listingId, action: "activate" }),
              "Listing is live!",
            )
          }
        >
          <PlayIcon data-icon="inline-start" aria-hidden="true" />
          {status === "DRAFT" ? "Publish" : "Resume"}
        </Button>
      )}

      {status === "ACTIVE" && (
        <Button
          variant="outline"
          size="sm"
          disabled={pending}
          onClick={() =>
            run(
              () => setListingStatusAction({ listingId, action: "pause" }),
              "Listing paused — buyers can't see it.",
            )
          }
        >
          <PauseIcon data-icon="inline-start" aria-hidden="true" />
          Pause
        </Button>
      )}

      {editable &&
        (armed ? (
          <span ref={groupRef} className="inline-flex items-center gap-1.5">
            <Button
              ref={confirmRef}
              variant="destructive"
              size="sm"
              disabled={pending}
              onClick={() =>
                run(
                  () => removeListingAction({ listingId }),
                  "Listing removed.",
                )
              }
            >
              Confirm remove
            </Button>
            <Button
              variant="ghost"
              size="sm"
              aria-label="Cancel remove"
              onClick={() => setArmed(false)}
            >
              <XIcon aria-hidden="true" />
            </Button>
          </span>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            disabled={pending}
            className="text-muted-foreground hover:text-destructive"
            onClick={() => setArmed(true)}
          >
            <Trash2Icon data-icon="inline-start" aria-hidden="true" />
            Remove
          </Button>
        ))}
    </div>
  );
}
