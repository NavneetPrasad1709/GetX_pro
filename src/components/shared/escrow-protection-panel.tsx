import {
  ShieldCheckIcon,
  LockIcon,
  RotateCcwIcon,
  ShieldAlertIcon,
} from "lucide-react";
import { siteConfig } from "@/config/site";
import { cn } from "@/lib/utils";

/**
 * "How GETX protects you" surface (Prompt 13) — pure SERVER component, reused on
 * the listing sidebar, checkout, and buy box. The auto-release window always
 * comes from siteConfig.escrow.autoReleaseDays (one source, never hardcoded).
 */

type Props = {
  /** full = listing sidebar + checkout · compact = buy box footer · inline = slim strip */
  variant: "full" | "compact" | "inline";
  className?: string;
};

const ROWS = [
  {
    icon: LockIcon,
    iconClass: "text-primary",
    title: "Escrow-protected",
    desc: "Your payment is held by GETX — the seller receives nothing until you confirm delivery.",
  },
  {
    icon: RotateCcwIcon,
    iconClass: "text-primary",
    title: "Money-back guarantee",
    desc: "If the seller doesn't deliver or it's not as described, you get a full refund.",
  },
  {
    icon: ShieldAlertIcon,
    iconClass: "text-warning/80",
    title: "Dispute resolution",
    desc: `Something wrong? Open a dispute within ${siteConfig.escrow.autoReleaseDays} days of delivery — our team reviews and resolves fairly.`,
  },
];

export function EscrowProtectionPanel({ variant, className }: Props) {
  if (variant === "compact") {
    return (
      <p
        className={cn(
          "flex items-start gap-1.5 text-xs text-muted-foreground",
          className,
        )}
      >
        <LockIcon
          className="mt-0.5 size-3.5 shrink-0 text-primary"
          aria-hidden="true"
        />
        <span>
          Payment held in escrow until you confirm delivery.{" "}
          <span className="font-semibold text-foreground">
            Money-back guarantee
          </span>{" "}
          if anything&apos;s wrong.
        </span>
      </p>
    );
  }

  if (variant === "inline") {
    return (
      <p
        className={cn(
          "flex items-center gap-2 rounded-md border border-primary/20 bg-primary/8 px-3 py-2 text-xs text-foreground",
          className,
        )}
      >
        <ShieldCheckIcon
          className="size-3.5 shrink-0 text-primary"
          aria-hidden="true"
        />
        <span>
          <span className="font-semibold">GETX escrow protects this order.</span>{" "}
          Your payment is held safely until you confirm delivery or{" "}
          {siteConfig.escrow.autoReleaseDays} days pass.
        </span>
      </p>
    );
  }

  // full
  return (
    <section
      aria-labelledby="escrow-protection-heading"
      className={cn("rounded-lg border border-border bg-card/60 p-4", className)}
    >
      <h2
        id="escrow-protection-heading"
        className="flex items-center gap-2 text-sm font-semibold"
      >
        <ShieldCheckIcon className="size-4 text-primary" aria-hidden="true" />
        How GETX protects you
      </h2>
      <ul className="mt-3 flex flex-col gap-3">
        {ROWS.map((row) => {
          const Icon = row.icon;
          return (
            <li key={row.title} className="flex gap-2.5">
              <Icon
                className={cn("mt-0.5 size-4 shrink-0", row.iconClass)}
                aria-hidden="true"
              />
              <div>
                <p className="text-[13px] font-semibold text-foreground">
                  {row.title}
                </p>
                <p className="text-[12.5px] text-muted-foreground">{row.desc}</p>
              </div>
            </li>
          );
        })}
      </ul>
      <p className="mt-3 border-t border-border pt-3 text-[11px] text-faint">
        Payment auto-releases {siteConfig.escrow.autoReleaseDays} days after
        delivery if you take no action.
      </p>
    </section>
  );
}
