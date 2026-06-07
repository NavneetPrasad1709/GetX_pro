"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { LockIcon } from "lucide-react";
import type { PaymentProvider } from "@prisma/client";
import { startPaymentAction } from "@/server/actions/payments";
import { formatMoney } from "@/lib/money";
import { ctaVariants } from "@/components/shared/cta-link";
import { cn } from "@/lib/utils";

/**
 * "Pay now" island (Step 09). Sends ONLY { orderId, provider } to the server —
 * the action recomputes everything from the DB. Two gateway UX paths:
 *   • CoinGate → full redirect to the hosted crypto invoice.
 *   • Razorpay → Standard Checkout modal (checkout.js, loaded on demand).
 * Whatever the gateway reports client-side is treated as UX-only — the page
 * just flips to "confirming" and the WEBHOOK decides the real order status.
 */

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

export function PayNow({
  orderId,
  totalMinor,
  currency,
  initialProvider,
}: {
  orderId: string;
  totalMinor: number;
  currency: string;
  initialProvider: PaymentProvider | null;
}) {
  const router = useRouter();
  const [provider, setProvider] = useState<PaymentProvider>(
    initialProvider ?? "RAZORPAY",
  );
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  // Razorpay modal is open — keep the button locked beyond the transition.
  const [modalOpen, setModalOpen] = useState(false);

  function openRazorpay(checkout: RazorpayCheckout) {
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
        // Success in the modal = "we'll confirm shortly" — never the truth.
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
      const res = await startPaymentAction({ orderId, provider });
      if (!res.ok) {
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
      openRazorpay(res.charge.checkout);
    });
  }

  const busy = isPending || modalOpen;

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <LockIcon className="size-4 text-primary" aria-hidden="true" />
        Pay securely — money stays in escrow
      </div>

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
        {busy ? "Opening payment…" : `Pay now · ${formatMoney(totalMinor, currency)}`}
      </button>

      <p className="text-center text-xs text-faint">
        Released to the seller only after you confirm delivery.
      </p>
    </div>
  );
}
