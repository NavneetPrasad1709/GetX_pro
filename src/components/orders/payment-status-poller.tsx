"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Loader2Icon } from "lucide-react";

/**
 * Rendered by the order page ONLY while we're waiting for the payment webhook
 * (?confirming=1 and the order is still AWAITING_PAYMENT). Refreshes the RSC
 * payload every few seconds so the page flips to PAID the moment the webhook
 * lands — without trusting anything from the client/gateway redirect.
 * Gives up quietly after ~2 minutes (crypto confirmations can take longer;
 * the banner copy manages that expectation).
 */

const INTERVAL_MS = 4_000;
const MAX_TICKS = 30; // ~2 minutes

export function PaymentStatusPoller() {
  const router = useRouter();
  const ticks = useRef(0);

  useEffect(() => {
    const id = setInterval(() => {
      ticks.current += 1;
      if (ticks.current > MAX_TICKS) {
        clearInterval(id);
        return;
      }
      router.refresh();
    }, INTERVAL_MS);
    return () => clearInterval(id);
  }, [router]);

  return (
    <div
      role="status"
      className="flex items-center gap-2.5 rounded-lg border border-primary/40 bg-primary/5 p-4 text-sm"
    >
      <Loader2Icon
        className="size-4 shrink-0 animate-spin text-primary"
        aria-hidden="true"
      />
      <span>
        <span className="font-semibold">Confirming your payment…</span>{" "}
        <span className="text-muted-foreground">
          This updates automatically. Crypto can take a few minutes to confirm —
          it&apos;s safe to leave and check back from your orders.
        </span>
      </span>
    </div>
  );
}
