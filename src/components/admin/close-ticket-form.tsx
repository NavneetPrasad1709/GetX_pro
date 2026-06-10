"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { closeTicket } from "@/server/actions/support";

/**
 * Admin "close ticket" form (Step 16). Saves an optional resolution note and flips the
 * ticket to CLOSED via the ADMIN-gated Server Action. Idempotent server-side.
 */
export function CloseTicketForm({ ticketId }: { ticketId: string }) {
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function onClose() {
    setError(null);
    startTransition(async () => {
      const res = await closeTicket({ ticketId, note: note.trim() || undefined });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <h2 className="mb-1.5 font-heading text-sm font-semibold">Resolve ticket</h2>
      <p className="mb-3 text-xs text-muted-foreground">
        Add an internal note (optional), then close the ticket. The user is not emailed.
      </p>
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value.slice(0, 2000))}
        rows={3}
        maxLength={2000}
        placeholder="What did you do to resolve this?"
        aria-label="Resolution note"
        className="w-full resize-y rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
      />
      {error ? (
        <p role="alert" className="mt-2 text-xs text-destructive">
          {error}
        </p>
      ) : null}
      <div className="mt-3 flex justify-end">
        <Button onClick={onClose} disabled={pending}>
          {pending ? "Closing…" : "Close ticket"}
        </Button>
      </div>
    </section>
  );
}
