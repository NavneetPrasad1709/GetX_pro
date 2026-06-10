import {
  CreditCardIcon,
  LockIcon,
  PackageCheckIcon,
  CircleCheckIcon,
} from "lucide-react";
import { siteConfig } from "@/config/site";

/**
 * Educational 4-step escrow pre-frame shown at the top of checkout (Prompt 13).
 * There is no order yet — this is pure trust-building copy, not status-driven.
 * Pure SERVER component. Hidden on mobile (the page summary leads there).
 */

const STEPS = [
  { icon: CreditCardIcon, label: "You pay", active: true },
  { icon: LockIcon, label: "We hold in escrow", active: false },
  { icon: PackageCheckIcon, label: "Seller delivers", active: false },
  {
    icon: CircleCheckIcon,
    label: `You confirm / ${siteConfig.escrow.autoReleaseDays}d auto-release`,
    active: false,
  },
];

export function CompactEscrowSteps() {
  return (
    <ol
      aria-label="How escrow works"
      className="hidden items-center gap-1 rounded-lg border border-border bg-card/50 px-4 py-2.5 text-xs min-[761px]:flex"
    >
      {STEPS.map((step, i) => {
        const Icon = step.icon;
        return (
          <li key={step.label} className="flex items-center gap-1">
            <span
              className={
                step.active
                  ? "flex items-center gap-1.5 font-semibold text-foreground"
                  : "flex items-center gap-1.5 text-muted-foreground"
              }
            >
              <Icon
                className={step.active ? "size-4 text-primary" : "size-4"}
                aria-hidden="true"
              />
              {step.label}
            </span>
            {i < STEPS.length - 1 && (
              <span className="px-1.5 text-faint" aria-hidden="true">
                →
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}
