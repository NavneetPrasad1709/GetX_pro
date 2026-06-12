"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BanknoteIcon, CheckCircle2Icon } from "lucide-react";
import { savePayoutAccountAction } from "@/server/actions/payout-account";
import { CRYPTO_NETWORKS } from "@/lib/validators/payout-account";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { ctaVariants } from "@/components/shared/cta-link";
import { cn } from "@/lib/utils";

type Saved = {
  method: "RAZORPAY" | "CRYPTO";
  holderName: string;
  label: string;
} | null;

/**
 * Save/edit the seller's withdrawal destination (P1-T1). The account number is
 * sent over HTTPS to the server action (encrypted at rest there) and cleared
 * from state on success — only a masked hint ever comes back.
 */
export function PayoutAccountForm({ saved }: { saved: Saved }) {
  const router = useRouter();
  const [editing, setEditing] = useState(!saved);
  const [method, setMethod] = useState<"RAZORPAY" | "CRYPTO">(saved?.method ?? "RAZORPAY");
  const [holderName, setHolderName] = useState(saved?.holderName ?? "");
  const [upiVpa, setUpiVpa] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [ifsc, setIfsc] = useState("");
  const [cryptoNetwork, setCryptoNetwork] = useState<string>(CRYPTO_NETWORKS[0]);
  const [walletAddress, setWalletAddress] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (saved && !editing) {
    return (
      <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <CheckCircle2Icon className="size-4 text-success" aria-hidden="true" />
          Payout method saved
        </div>
        <p className="text-sm text-muted-foreground">
          {saved.label} ·{" "}
          <span className="text-foreground">{saved.holderName}</span>
        </p>
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="self-start rounded-sm text-xs font-semibold text-primary hover:text-primary-hover focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          Edit destination
        </button>
      </div>
    );
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await savePayoutAccountAction({
        method,
        holderName,
        upiVpa,
        accountNumber,
        ifsc,
        cryptoNetwork,
        walletAddress,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setAccountNumber(""); // never keep the secret in component state
      setEditing(false);
      router.refresh();
    });
  }

  return (
    <form
      onSubmit={submit}
      className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4"
    >
      <div className="flex items-center gap-2 text-sm font-semibold">
        <BanknoteIcon className="size-4 text-primary" aria-hidden="true" />
        Payout method
      </div>
      <p className="text-xs text-muted-foreground">
        Where should we send your withdrawals? Stored securely — only a masked
        hint is ever shown back.
      </p>

      <div className="grid grid-cols-2 gap-2">
        {(["RAZORPAY", "CRYPTO"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMethod(m)}
            className={cn(
              "rounded-lg border px-3 py-2 text-sm font-semibold transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
              method === m
                ? "border-primary/60 bg-primary/5 text-foreground"
                : "border-border text-muted-foreground hover:text-foreground",
            )}
          >
            {m === "RAZORPAY" ? "Bank / UPI" : "Crypto"}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="pa-holder">Account holder name</Label>
        <Input
          id="pa-holder"
          value={holderName}
          onChange={(e) => setHolderName(e.target.value)}
          placeholder="As shown on the account"
          disabled={isPending}
        />
      </div>

      {method === "RAZORPAY" ? (
        <>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="pa-upi">
              UPI ID{" "}
              <span className="font-normal text-muted-foreground">
                (or fill the bank fields below)
              </span>
            </Label>
            <Input
              id="pa-upi"
              value={upiVpa}
              onChange={(e) => setUpiVpa(e.target.value)}
              placeholder="name@bank"
              disabled={isPending}
              autoComplete="off"
            />
          </div>
          <div className="grid grid-cols-1 gap-3 min-[521px]:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="pa-acct">Bank account number</Label>
              <Input
                id="pa-acct"
                inputMode="numeric"
                value={accountNumber}
                onChange={(e) => setAccountNumber(e.target.value)}
                placeholder="6–20 digits"
                disabled={isPending}
                autoComplete="off"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="pa-ifsc">IFSC</Label>
              <Input
                id="pa-ifsc"
                value={ifsc}
                onChange={(e) => setIfsc(e.target.value.toUpperCase())}
                placeholder="HDFC0001234"
                disabled={isPending}
                autoComplete="off"
              />
            </div>
          </div>
        </>
      ) : (
        <>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="pa-net">Network</Label>
            <NativeSelect
              id="pa-net"
              value={cryptoNetwork}
              onChange={(e) => setCryptoNetwork(e.target.value)}
              disabled={isPending}
            >
              {CRYPTO_NETWORKS.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="pa-wallet">Wallet address</Label>
            <Input
              id="pa-wallet"
              value={walletAddress}
              onChange={(e) => setWalletAddress(e.target.value)}
              placeholder="Your receiving address"
              disabled={isPending}
              autoComplete="off"
            />
          </div>
        </>
      )}

      {error ? (
        <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <div className="flex items-center gap-2.5">
        <button
          type="submit"
          disabled={isPending}
          className={cn(ctaVariants(), "disabled:opacity-60")}
        >
          {isPending ? "Saving…" : "Save payout method"}
        </button>
        {saved ? (
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="rounded-sm text-sm font-semibold text-muted-foreground hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            Cancel
          </button>
        ) : null}
      </div>
    </form>
  );
}
