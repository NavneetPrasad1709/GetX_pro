"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ZapIcon, Trash2Icon, AlertTriangleIcon } from "lucide-react";
import {
  addDeliveryItemsAction,
  deleteDeliveryItemAction,
} from "@/server/actions/delivery";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

type Item = { id: string; preview: string };

/**
 * Seller auto-delivery stock manager (Step 19). Upload one item per line; items are encrypted
 * server-side and assigned automatically the moment an order is PAID. The list is masked (never
 * shows full content). Rendered only for INSTANT listings when the encryption key is configured.
 */
export function DeliveryStockManager({
  listingId,
  initialCount,
  initialItems,
}: {
  listingId: string;
  initialCount: number;
  initialItems: Item[];
}) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [items, setItems] = useState<Item[]>(initialItems);
  const [count, setCount] = useState(initialCount);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = () => {
    setError(null);
    startTransition(async () => {
      const res = await addDeliveryItemsAction({ listingId, rawText: text });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setText("");
      router.refresh(); // re-fetch the masked list + count
    });
  };

  const remove = (itemId: string) => {
    setError(null);
    const prev = items;
    setItems((xs) => xs.filter((i) => i.id !== itemId));
    setCount((c) => Math.max(0, c - 1));
    startTransition(async () => {
      const res = await deleteDeliveryItemAction({ itemId, listingId });
      if (!res.ok) {
        setItems(prev);
        setCount(prev.length);
        setError(res.error);
      }
    });
  };

  return (
    <section className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-1.5 text-base font-semibold">
            <ZapIcon className="size-4 text-primary" aria-hidden="true" />
            Auto-delivery stock
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            One item per line. Delivered instantly + encrypted — buyers get it the moment they pay.
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-primary/10 px-2.5 py-1 text-sm font-semibold text-primary tabular-nums">
          ⚡ {count} ready
        </span>
      </div>

      {count === 0 ? (
        <Alert tone="danger">No items — this listing is paused automatically until you add stock.</Alert>
      ) : count < 5 ? (
        <Alert tone="warn">Low stock — add more items before your listing sells out.</Alert>
      ) : null}

      <div className="flex flex-col gap-2">
        <Label htmlFor="delivery-items">Add items</Label>
        <Textarea
          id="delivery-items"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={"ACCOUNT-1: user / pass\nACCOUNT-2: user / pass\n…"}
          rows={5}
          disabled={pending}
          className="font-mono text-sm"
        />
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
        <div>
          <Button type="button" onClick={submit} disabled={pending || text.trim().length === 0}>
            {pending ? "Adding…" : "Add items"}
          </Button>
        </div>
      </div>

      {items.length > 0 ? (
        <div className="flex flex-col gap-1.5">
          <p className="text-xs font-medium text-muted-foreground">In stock (masked)</p>
          <ul className="flex flex-col divide-y divide-border rounded-lg border border-border">
            {items.map((item) => (
              <li key={item.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                <code className="font-mono text-muted-foreground">{item.preview}</code>
                <button
                  type="button"
                  onClick={() => remove(item.id)}
                  disabled={pending}
                  aria-label="Delete item"
                  className="rounded-md p-1.5 text-muted-foreground transition-colors hover:text-destructive disabled:opacity-50 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                >
                  <Trash2Icon className="size-4" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

function Alert({ tone, children }: { tone: "warn" | "danger"; children: React.ReactNode }) {
  return (
    <p
      className={cn(
        "flex items-center gap-2 rounded-lg px-3 py-2 text-sm",
        tone === "danger"
          ? "bg-destructive/10 text-destructive"
          : "bg-warning/10 text-warning",
      )}
    >
      <AlertTriangleIcon className="size-4 shrink-0" aria-hidden="true" />
      {children}
    </p>
  );
}
