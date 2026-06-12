import type { Metadata } from "next";
import { CheckIcon } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { siteConfig } from "@/config/site";
import { formatMoney } from "@/lib/money";
import { SubscribeProButton } from "@/components/seller/subscribe-pro-button";

export const metadata: Metadata = { title: "GETX Pro" };

const dateFmt = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium" });

/** GETX Pro pricing + subscribe (Prompt 15, Stream 4). */
export default async function SubscriptionPage() {
  const session = await requireUser();
  const profile = await db.sellerProfile.findUnique({
    where: { userId: session.user.id },
    select: { subscriptionTier: true, subscriptionExpiresAt: true },
  });

  const { proMonthlyFeeMinor, proCommissionDiscount } =
    siteConfig.fees.subscription;
  const isPro =
    profile?.subscriptionTier === "PRO" &&
    profile.subscriptionExpiresAt != null &&
    profile.subscriptionExpiresAt > new Date();

  const freeFeatures = [
    "Unlimited active listings",
    "Standard commission rates",
    "Escrow-protected payouts",
  ];
  const proFeatures = [
    `${proCommissionDiscount}% lower commission on every sale`,
    "Priority support queue",
    "GETX Pro badge on your listings",
    "Seller analytics (rolling out)",
  ];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">GETX Pro</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Lower commission, more listings, and a trust badge — built for sellers
          with consistent volume.
        </p>
      </div>

      {isPro && profile?.subscriptionExpiresAt ? (
        <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 text-sm">
          <p className="font-semibold text-foreground">GETX Pro is active.</p>
          <p className="mt-0.5 text-muted-foreground">
            Renews until {dateFmt.format(profile.subscriptionExpiresAt)}.
          </p>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 min-[761px]:grid-cols-2">
        {/* Free */}
        <div className="flex flex-col rounded-xl border border-border bg-card p-5">
          <p className="font-heading text-lg font-bold">Free</p>
          <p className="mt-1 text-2xl font-bold tabular-nums">₹0</p>
          <ul className="mt-4 flex flex-1 flex-col gap-2 text-sm text-muted-foreground">
            {freeFeatures.map((f) => (
              <li key={f} className="flex items-start gap-2">
                <CheckIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                {f}
              </li>
            ))}
          </ul>
        </div>

        {/* Pro */}
        <div className="flex flex-col rounded-xl border border-primary/40 bg-primary/5 p-5">
          <div className="flex items-center gap-2">
            <p className="font-heading text-lg font-bold">Pro</p>
            <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-bold tracking-wide text-primary">
              POPULAR
            </span>
          </div>
          <p className="mt-1 text-2xl font-bold tabular-nums">
            {formatMoney(proMonthlyFeeMinor, "INR")}
            <span className="text-sm font-normal text-muted-foreground">/month</span>
          </p>
          <ul className="mt-4 flex flex-1 flex-col gap-2 text-sm">
            {proFeatures.map((f) => (
              <li key={f} className="flex items-start gap-2">
                <CheckIcon className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
                {f}
              </li>
            ))}
          </ul>
          <div className="mt-5">
            <SubscribeProButton isActive={isPro} className="inline-flex w-full items-center justify-center rounded-sm bg-primary px-5 py-2.5 font-heading text-sm font-bold text-primary-foreground transition-colors hover:bg-primary-strong disabled:opacity-60 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none" />
          </div>
          <p className="mt-2 text-center text-[11px] text-faint">
            Billed from your wallet balance. Cancel anytime — Pro simply lapses at
            the renewal date.
          </p>
        </div>
      </div>
    </div>
  );
}
