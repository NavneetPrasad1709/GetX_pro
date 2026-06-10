"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2Icon, ClockIcon, RefreshCwIcon } from "lucide-react";

/**
 * Rendered by the order page ONLY while we're waiting for the payment webhook
 * (?confirming=1 and the order is still AWAITING_PAYMENT). Refreshes the RSC
 * payload every few seconds so the page flips to PAID the moment the webhook
 * lands — without trusting anything from the client/gateway redirect.
 * After ~2 minutes it surfaces a visible "still waiting" recovery card (crypto
 * can take 10–30 min) with a retry + a link to all orders — never a frozen
 * spinner (Prompt 05).
 */

const INTERVAL_MS = 4_000;
const MAX_TICKS = 30; // ~2 minutes

export function PaymentStatusPoller() {
  const router = useRouter();
  const ticks = useRef(0);
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    if (timedOut) return;
    const id = setInterval(() => {
      ticks.current += 1;
      if (ticks.current > MAX_TICKS) {
        clearInterval(id);
        setTimedOut(true);
        return;
      }
      router.refresh();
    }, INTERVAL_MS);
    return () => clearInterval(id);
  }, [router, timedOut]);

  if (timedOut) {
    return (
      <div
        role="status"
        className="flex flex-col gap-3 rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 text-sm"
      >
        <div className="flex items-center gap-2.5">
          <ClockIcon className="size-4 shrink-0 text-amber-400" aria-hidden="true" />
          <span className="font-semibold text-amber-300">
            Still waiting for confirmation
          </span>
        </div>
        <p className="text-xs text-muted-foreground">
          Crypto payments can take up to 30 minutes to confirm on-chain. Your
          funds are safe — this page will update once the network confirms.
        </p>
        <div className="flex flex-wrap gap-4">
          <button
            type="button"
            onClick={() => {
              ticks.current = 0;
              setTimedOut(false);
              router.refresh();
            }}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:text-primary-hover"
          >
            <RefreshCwIcon className="size-3.5" aria-hidden="true" />
            Check again
          </button>
          <Link
            href="/orders"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground"
          >
            View all orders →
          </Link>
        </div>
      </div>
    );
  }

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
