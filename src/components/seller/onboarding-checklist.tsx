import Link from "next/link";
import { CheckCircle2Icon, CircleIcon, ClockIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Seller activation checklist (Prompt 14) — shown on the seller hub until all 4
 * milestones are complete. Pure server component; all state derived from props
 * the hub already fetched (no extra round-trip).
 */

export type OnboardingState = {
  emailVerified: boolean;
  kycApproved: boolean;
  kycPending: boolean; // submitted but not yet approved → "in review" hint
  firstListingDone: boolean;
  payoutMethodSet: boolean;
};

type Step = {
  label: string;
  done: boolean;
  pending?: boolean;
  locked?: boolean; // gated by an earlier step (e.g. listing needs APPROVED KYC)
  href: string;
  cta: string;
  hint: string;
};

export function OnboardingChecklist({ state }: { state: OnboardingState }) {
  const steps: Step[] = [
    {
      label: "Verify your email",
      done: state.emailVerified,
      href: "/become-seller",
      cta: "Resend email",
      hint: "Confirms it's really you — keeps your shop secure.",
    },
    {
      label: "Complete KYC verification",
      done: state.kycApproved,
      pending: state.kycPending && !state.kycApproved,
      href: "/seller/verify",
      cta: state.kycPending ? "Check status" : "Verify now",
      hint: "Required before you can list, sell, or withdraw earnings.",
    },
    {
      label: "Create your first listing",
      done: state.firstListingDone,
      locked: !state.kycApproved,
      href: "/seller/listings/new",
      cta: "Create listing",
      hint: state.kycApproved
        ? "Listings with photos + clear titles sell first."
        : "Unlocks once your ID is verified.",
    },
    {
      label: "Set your payout method",
      done: state.payoutMethodSet,
      href: "/seller/wallet",
      cta: "Set up payouts",
      hint: "So your escrow earnings reach you fast.",
    },
  ];

  const doneCount = steps.filter((s) => s.done).length;
  const pct = Math.round((doneCount / steps.length) * 100);

  // All complete → a slim "shop ready" banner instead of the full checklist.
  if (doneCount === steps.length) {
    return (
      <div className="flex items-center gap-2.5 rounded-lg border border-success/30 bg-success/5 p-4 text-sm">
        <CheckCircle2Icon className="size-5 shrink-0 text-success" aria-hidden="true" />
        <span>
          <span className="font-semibold">Shop ready.</span> Every setup step is
          done — keep growing with great listings and fast delivery.
        </span>
      </div>
    );
  }

  return (
    <section
      aria-labelledby="onboarding-heading"
      className="rounded-xl border border-border bg-card p-5"
    >
      <div className="flex items-center justify-between gap-3">
        <h2 id="onboarding-heading" className="font-heading text-base font-bold">
          Get your shop ready
        </h2>
        <span className="text-xs font-semibold text-muted-foreground tabular-nums">
          {doneCount}/{steps.length} done
        </span>
      </div>

      {/* progress bar */}
      <div
        className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Setup progress"
      >
        <div
          className="h-full rounded-full bg-primary transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>

      <ol className="mt-4 flex flex-col gap-2.5">
        {steps.map((step) => (
          <li
            key={step.label}
            className="flex items-center gap-3 rounded-lg border border-border/60 bg-background/40 p-3"
          >
            {step.done ? (
              <CheckCircle2Icon
                className="size-5 shrink-0 text-success"
                aria-hidden="true"
              />
            ) : step.pending ? (
              <ClockIcon className="size-5 shrink-0 text-warning" aria-hidden="true" />
            ) : (
              <CircleIcon
                className="size-5 shrink-0 text-muted-foreground"
                aria-hidden="true"
              />
            )}
            <div className="min-w-0 flex-1">
              <p
                className={cn(
                  "text-sm font-semibold",
                  step.done && "text-muted-foreground line-through",
                )}
              >
                {step.label}
                {step.pending && (
                  <span className="ml-2 align-middle text-[11px] font-medium text-warning">
                    in review
                  </span>
                )}
              </p>
              {!step.done && (
                <p className="text-xs text-muted-foreground">{step.hint}</p>
              )}
            </div>
            {!step.done && !step.locked && (
              <Link
                href={step.href}
                className="shrink-0 rounded-sm px-2 py-1 text-xs font-semibold text-primary hover:text-primary-hover focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
              >
                {step.cta} →
              </Link>
            )}
            {!step.done && step.locked && (
              <span className="shrink-0 px-2 py-1 text-xs font-semibold text-muted-foreground">
                Locked
              </span>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}
