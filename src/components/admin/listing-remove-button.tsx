"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { removeListingAction } from "@/server/actions/admin";
import { Button } from "@/components/ui/button";

/** Admin take-down of a listing → REMOVED (Step 15). Audit-logged server-side. */
export function ListingRemoveButton({
  listingId,
  removed,
}: {
  listingId: string;
  removed: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (removed) {
    return <span className="text-xs text-faint">Removed</span>;
  }

  function remove() {
    setError(null);
    startTransition(async () => {
      const res = await removeListingAction({ listingId });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button type="button" size="xs" variant="destructive" disabled={isPending} onClick={remove}>
        Remove
      </Button>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
