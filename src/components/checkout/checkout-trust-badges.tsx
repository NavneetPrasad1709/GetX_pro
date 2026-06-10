import { ShieldCheckIcon, RefreshCwIcon, LockIcon } from "lucide-react";
import { siteConfig } from "@/config/site";

/**
 * Last-metre trust signals at the payment action (Prompt 05). Pure Server
 * Component — a short escrow explainer + a 3-badge row. The auto-release window
 * comes from siteConfig (single source), never hardcoded.
 */
export function CheckoutTrustBadges() {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-center text-xs text-faint">
        Your payment is held in escrow and only released after you confirm
        delivery. Auto-released in {siteConfig.escrow.autoReleaseDays} days if you
        don&apos;t respond.
      </p>
      <div className="flex flex-wrap justify-center gap-x-5 gap-y-2">
        <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <ShieldCheckIcon className="size-4 text-success" aria-hidden="true" />
          Escrow protected
        </span>
        <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <RefreshCwIcon className="size-4 text-primary" aria-hidden="true" />
          Money-back guarantee
        </span>
        <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <LockIcon className="size-4 text-muted-foreground" aria-hidden="true" />
          256-bit SSL
        </span>
      </div>
    </div>
  );
}
