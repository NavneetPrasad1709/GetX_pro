"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { PaymentProvider } from "@prisma/client";
import { createOrderAction } from "@/server/actions/orders";
import { startPaymentAction } from "@/server/actions/payments";
import { formatMoney } from "@/lib/money";
import { ctaVariants } from "@/components/shared/cta-link";
import { cn } from "@/lib/utils";

const PROVIDERS: { value: PaymentProvider; label: string; hint: string }[] = [
  { value: "RAZORPAY", label: "UPI / Cards (Razorpay)", hint: "Pay in INR" },
  {
    value: "COINGATE",
    label: "Crypto (CoinGate)",
    hint: "USDT, BTC, ETH — billed as the USD equivalent",
  },
];

type RazorpayCheckout = {
  keyId: string;
  rzpOrderId: string;
  amountMinor: number;
  currency: string;
  name: string;
  description: string;
  prefillEmail: string | null;
};

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => { open: () => void };
  }
}

let checkoutJsPromise: Promise<void> | null = null;
/** Load checkout.js once per page; reject cleanly if the CDN is unreachable. */
function loadCheckoutJs(): Promise<void> {
  if (window.Razorpay) return Promise.resolve();
  checkoutJsPromise ??= new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.onload = () => resolve();
    script.onerror = () => {
      checkoutJsPromise = null; // allow a retry on the next click
      reject(new Error("checkout.js failed to load"));
    };
    document.body.appendChild(script);
  });
  return checkoutJsPromise;
}

/**
 * One-step checkout (Prompt 05): creates the order AND launches the gateway in a
 * SINGLE button press — no intermediate /orders/[id] page load. The Razorpay /
 * CoinGate launch logic is copied verbatim from <PayNow>; this component sends
 * ONLY { listingSlug, qty, provider } then { orderId, provider } — every money
 * figure is recomputed server-side (the actions are unchanged). Renders the
 * inline pay panel AND the fixed mobile pay bar from ONE shared state so they
 * never drift.
 */
export function CheckoutPayButton({
  listingSlug,
  qty,
  totalMinor,
  currency,
  maxRedeemablePoints = 0,
  pointValueMinor = 10,
}: {
  listingSlug: string;
  qty: number;
  totalMinor: number;
  currency: string;
  /** Loyalty (Step 21): max points this buyer can redeem here (server already clamped). */
  maxRedeemablePoints?: number;
  pointValueMinor?: number;
}) {
  const router = useRouter();
  const [provider, setProvider] = useState<PaymentProvider>("RAZORPAY");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  // Razorpay modal is open — keep the button locked beyond the transition.
  const [modalOpen, setModalOpen] = useState(false);
  // Loyalty redemption toggle (Step 21). The server re-clamps regardless of this value.
  const [redeem, setRedeem] = useState(false);

  const discountMinor = redeem ? maxRedeemablePoints * pointValueMinor : 0;
  const payMinor = Math.max(0, totalMinor - discountMinor);

  function openRazorpay(orderId: string, checkout: RazorpayCheckout) {
    setModalOpen(true);
    const rzp = new window.Razorpay!({
      key: checkout.keyId,
      order_id: checkout.rzpOrderId,
      amount: checkout.amountMinor,
      currency: checkout.currency,
      name: checkout.name,
      description: checkout.description,
      prefill: checkout.prefillEmail ? { email: checkout.prefillEmail } : undefined,
      theme: { color: "#4d7cfe" },
      handler: () => {
        // Success in the modal = "we'll confirm shortly" — the webhook is truth.
        setModalOpen(false);
        router.replace(`/orders/${orderId}?confirming=1`);
        router.refresh();
      },
      modal: {
        ondismiss: () => setModalOpen(false), // closed without paying → retry allowed
      },
    });
    rzp.open();
  }

  function pay() {
    setError(null);
    startTransition(async () => {
      // 1) create the order (server recomputes all money + auth + rate-limit)
      const created = await createOrderAction({
        listingSlug,
        qty,
        provider,
        redeemPoints: redeem ? maxRedeemablePoints : 0,
      });
      if (!created.ok || !created.orderId) {
        setError(created.error ?? "Could not place the order. Please try again.");
        return;
      }
      const orderId = created.orderId;
      // 2) launch payment for that order — sequential, same transition
      const res = await startPaymentAction({ orderId, provider });
      if (!res.ok) {
        // The order exists in AWAITING_PAYMENT — the buyer can retry from /orders/[id].
        setError(res.error);
        return;
      }
      if (res.charge.provider === "COINGATE") {
        window.location.assign(res.charge.redirectUrl);
        return; // page navigates away
      }
      try {
        await loadCheckoutJs();
      } catch {
        setError(
          "The payment window could not load. Check your connection and try again.",
        );
        return;
      }
      openRazorpay(orderId, res.charge.checkout);
    });
  }

  const busy = isPending || modalOpen;

  return (
    <>
      <div className="flex flex-col gap-3">
        <fieldset className="flex flex-col gap-2">
          <legend className="sr-only">Payment method</legend>
          {PROVIDERS.map((p) => (
            <label
              key={p.value}
              className="flex cursor-pointer items-center gap-3 rounded-lg border border-border bg-background p-3 transition-colors has-checked:border-primary/60 has-checked:bg-primary/5 has-focus-visible:ring-3 has-focus-visible:ring-ring/50"
            >
              <input
                type="radio"
                name="pay-provider"
                value={p.value}
                checked={provider === p.value}
                onChange={() => setProvider(p.value)}
                disabled={busy}
                className="size-4 accent-primary"
              />
              <span className="flex flex-1 flex-col">
                <span className="text-sm font-semibold">{p.label}</span>
                <span className="text-xs text-muted-foreground">{p.hint}</span>
              </span>
            </label>
          ))}
        </fieldset>

        {maxRedeemablePoints > 0 ? (
          <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-border bg-background p-3 transition-colors has-checked:border-primary/60 has-checked:bg-primary/5">
            <input
              type="checkbox"
              checked={redeem}
              onChange={(e) => setRedeem(e.target.checked)}
              disabled={busy}
              className="size-4 accent-primary"
            />
            <span className="flex flex-1 flex-col">
              <span className="text-sm font-semibold">
                Use {maxRedeemablePoints.toLocaleString("en-US")} reward points
              </span>
              <span className="text-xs text-muted-foreground">
                −{formatMoney(maxRedeemablePoints * pointValueMinor, currency)} off this order
              </span>
            </span>
          </label>
        ) : null}

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
          onClick={pay}
          disabled={busy}
          className={cn(ctaVariants({ size: "lg" }), "w-full disabled:opacity-60")}
        >
          {busy ? "Processing…" : `Pay securely · ${formatMoney(payMinor, currency)}`}
        </button>
      </div>

      {/* sticky mobile pay bar — shares the exact same state as the inline button */}
      <div
        className="fixed inset-x-0 bottom-0 z-[55] border-t border-border bg-[rgba(10,11,13,0.96)] backdrop-blur-[10px] min-[901px]:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-3 px-4 py-3">
          <span className="min-w-0 truncate text-sm font-semibold tabular-nums">
            Qty {qty} · {formatMoney(payMinor, currency)}
          </span>
          <button
            type="button"
            onClick={pay}
            disabled={busy}
            className={cn(ctaVariants(), "min-h-11 shrink-0 disabled:opacity-60")}
          >
            {busy ? "Processing…" : "Pay securely"}
          </button>
        </div>
      </div>
    </>
  );
}
