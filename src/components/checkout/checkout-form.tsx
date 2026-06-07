"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { LockIcon } from "lucide-react";
import { createOrderAction } from "@/server/actions/orders";
import { formatMoney } from "@/lib/money";
import { ctaVariants } from "@/components/shared/cta-link";
import { cn } from "@/lib/utils";

type Provider = "RAZORPAY" | "COINGATE";

const PROVIDERS: { value: Provider; label: string; hint: string }[] = [
  { value: "RAZORPAY", label: "UPI / Cards (Razorpay)", hint: "Pay in INR" },
  { value: "COINGATE", label: "Crypto (CoinGate)", hint: "USDT, BTC, ETH" },
];

/**
 * Checkout client island: pick a payment method + place the order. The order is
 * created in AWAITING_PAYMENT by the server action (which recomputes all money
 * from the DB — this form sends NO price); the real charge is wired in Step 09.
 * The submit button is disabled while pending → no double order on double-click
 * (the service is idempotent server-side too).
 */
export function CheckoutForm({
  listingSlug,
  qty,
  totalMinor,
  currency,
}: {
  listingSlug: string;
  qty: number;
  totalMinor: number;
  currency: string;
}) {
  const router = useRouter();
  const [provider, setProvider] = useState<Provider>("RAZORPAY");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function placeOrder() {
    setError(null);
    startTransition(async () => {
      const res = await createOrderAction({ listingSlug, qty, provider });
      if (!res.ok || !res.orderId) {
        setError(res.error ?? "Could not place the order. Please try again.");
        return;
      }
      router.push(`/orders/${res.orderId}`);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <fieldset className="flex flex-col gap-2.5">
        <legend className="mb-1 text-sm font-medium">Payment method</legend>
        {PROVIDERS.map((p) => (
          <label
            key={p.value}
            className="flex cursor-pointer items-center gap-3 rounded-lg border border-border bg-card p-3.5 transition-colors has-checked:border-primary/60 has-checked:bg-primary/5 has-focus-visible:ring-3 has-focus-visible:ring-ring/50"
          >
            <input
              type="radio"
              name="provider"
              value={p.value}
              checked={provider === p.value}
              onChange={() => setProvider(p.value)}
              disabled={isPending}
              className="size-4 accent-primary"
            />
            <span className="flex flex-1 flex-col">
              <span className="text-sm font-semibold">{p.label}</span>
              <span className="text-xs text-muted-foreground">{p.hint}</span>
            </span>
          </label>
        ))}
      </fieldset>

      {error ? (
        <p
          role="alert"
          className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive"
        >
          {error}
        </p>
      ) : null}

      <button
        type="button"
        onClick={placeOrder}
        disabled={isPending}
        className={cn(ctaVariants({ size: "lg" }), "w-full disabled:opacity-60")}
      >
        <LockIcon className="size-[18px]" aria-hidden="true" />
        {isPending
          ? "Placing order…"
          : `Place order · ${formatMoney(totalMinor, currency)}`}
      </button>

      <p className="text-center text-xs text-faint">
        Your payment is held in escrow and only released to the seller after you
        confirm delivery. Money-back guarantee on every order.
      </p>
    </div>
  );
}
