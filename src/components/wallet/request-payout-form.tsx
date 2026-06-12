"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BanknoteIcon } from "lucide-react";
import { requestPayoutAction } from "@/server/actions/payouts";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ctaVariants } from "@/components/shared/cta-link";
import { formatMoney, parsePriceToMinor } from "@/lib/money";
import { computeInstantPayoutFeeMinor } from "@/lib/fees";
import { siteConfig } from "@/config/site";
import { cn } from "@/lib/utils";

/**
 * Withdraw earnings (Step 14). Sends a major-unit amount + method; the server
 * re-validates the balance and reserves the funds in a wallet-locked transaction.
 */
export function RequestPayoutForm({
  availableMinor,
  currency,
  hasPayoutAccount,
  destinationLabel,
}: {
  availableMinor: number;
  currency: string;
  /** A saved payout destination is required to withdraw (P1-T1). */
  hasPayoutAccount: boolean;
  /** Masked destination label shown above the withdraw button. */
  destinationLabel?: string;
}) {
  const router = useRouter();
  const [amount, setAmount] = useState("");
  const [instant, setInstant] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const min = siteConfig.payouts.minPayoutMinor;
  // Live instant-fee preview (server recomputes the authoritative value).
  const amountMinor = parsePriceToMinor(amount, "USD");
  const instantFeeMinor =
    instant && amountMinor != null && amountMinor > 0
      ? computeInstantPayoutFeeMinor(amountMinor)
      : 0;

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await requestPayoutAction({ amount, instant });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setAmount("");
      router.refresh();
    });
  }

  if (!hasPayoutAccount) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-card/40 p-4 text-sm text-muted-foreground">
        Add a payout method above before you can withdraw.
      </div>
    );
  }

  if (availableMinor < min) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-card/40 p-4 text-sm text-muted-foreground">
        Withdrawals unlock at {formatMoney(min, currency)}. Your available
        balance is{" "}
        <span className="font-semibold text-foreground">
          {formatMoney(availableMinor, currency)}
        </span>{" "}
        — keep selling!
      </div>
    );
  }

  return (
    <form
      onSubmit={submit}
      className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4"
    >
      <div className="flex items-center gap-2 text-sm font-semibold">
        <BanknoteIcon className="size-4 text-primary" aria-hidden="true" />
        Withdraw earnings
      </div>
      <p className="text-xs text-muted-foreground">
        Available now:{" "}
        <span className="font-semibold text-foreground">
          {formatMoney(availableMinor, currency)}
        </span>
      </p>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="payout-amount">Amount ($)</Label>
        <Input
          id="payout-amount"
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder={`Min ${formatMoney(min, currency)}`}
          disabled={isPending}
        />
      </div>
      {destinationLabel ? (
        <p className="text-xs text-muted-foreground">
          Sending to{" "}
          <span className="font-semibold text-foreground">{destinationLabel}</span>
        </p>
      ) : null}

      {/* Instant payout (Prompt 15b) — priority processing for a small fee. */}
      <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-border bg-background p-3 transition-colors has-checked:border-primary/50 has-checked:bg-primary/5">
        <input
          type="checkbox"
          checked={instant}
          onChange={(e) => setInstant(e.target.checked)}
          disabled={isPending}
          className="mt-0.5 size-4 accent-primary"
        />
        <span className="min-w-0 flex-1">
          <span className="text-sm font-semibold">
            Instant payout{" "}
            <span className="font-normal text-muted-foreground">
              ({siteConfig.payouts.instant.feePercent}% · min{" "}
              {formatMoney(siteConfig.payouts.instant.minFeeMinor, currency)})
            </span>
          </span>
          <span className="mt-0.5 block text-xs text-muted-foreground">
            Prioritized within 2 hours.
            {instantFeeMinor > 0
              ? ` Fee: ${formatMoney(instantFeeMinor, currency)}.`
              : ""}
          </span>
        </span>
      </label>

      {error ? (
        <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={isPending}
        className={cn(ctaVariants(), "w-full disabled:opacity-60")}
      >
        {isPending ? "Requesting…" : "Request withdrawal"}
      </button>
      <p className="text-center text-xs text-faint">
        {instant
          ? "Instant payouts are prioritized within 2 hours."
          : "Reviewed and paid by our team within 1–2 business days."}
      </p>
    </form>
  );
}
