"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { PartyPopperIcon, XIcon } from "lucide-react";

/**
 * One-time first-sale celebration + escrow explainer (Prompt 14). Shown on the
 * seller hub after `firstSaleAt` is set. Dismissal is stored in localStorage
 * (UI-only signal — no schema bloat) keyed by the seller profile id.
 */
export function FirstSaleCelebration({ sellerId }: { sellerId: string }) {
  const storageKey = `getx:first-sale-dismissed:${sellerId}`;
  // Start hidden to avoid a flash before we can read localStorage on the client.
  const [show, setShow] = useState(false);

  // Read persisted dismissal AFTER mount — localStorage isn't available during
  // SSR, and starting hidden avoids a hydration mismatch / content flash. This
  // is a legitimate external-system sync, hence the targeted rule disable.
  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time read of persisted dismissal on mount (external system)
      setShow(localStorage.getItem(storageKey) !== "1");
    } catch {
      setShow(true); // storage blocked → still show once
    }
  }, [storageKey]);

  if (!show) return null;

  function dismiss() {
    try {
      localStorage.setItem(storageKey, "1");
    } catch {
      // ignore — worst case it shows again next visit
    }
    setShow(false);
  }

  return (
    <section
      aria-labelledby="first-sale-heading"
      className="relative rounded-xl border border-primary/30 bg-primary/5 p-5"
    >
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss"
        className="absolute right-3 top-3 grid size-8 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        <XIcon className="size-4" aria-hidden="true" />
      </button>

      <div className="flex items-center gap-2">
        <PartyPopperIcon className="size-5 text-primary" aria-hidden="true" />
        <h2 id="first-sale-heading" className="font-heading text-base font-bold">
          Your first sale is complete!
        </h2>
      </div>
      <p className="mt-1.5 text-sm text-muted-foreground">
        Your earnings are now in your wallet — here&apos;s what just happened:
      </p>
      <ol className="mt-3 flex flex-col gap-1.5 text-sm text-muted-foreground">
        <li>1. The buyer confirmed receipt (or the 3-day auto-release triggered).</li>
        <li>2. Escrow released the funds to your wallet, minus the platform fee.</li>
        <li>3. Your trust score grows with every successful sale.</li>
      </ol>
      <div className="mt-4 flex flex-wrap gap-2.5">
        <Link
          href="/seller/wallet"
          className="rounded-sm bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary-strong focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          See wallet
        </Link>
        <Link
          href="/seller/listings"
          className="rounded-sm border border-border px-4 py-2 text-sm font-semibold hover:border-primary/40 hover:text-primary focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          Manage listings
        </Link>
      </div>
    </section>
  );
}
