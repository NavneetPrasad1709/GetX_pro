import Link from "next/link";
import { LockIcon } from "lucide-react";
import { Logo } from "@/components/shared/icons";

/**
 * Minimal checkout header (Prompt 01): logo (escape hatch) + a green-lock
 * "Secure checkout" trust signal. No nav, no Sell CTA, no UserMenu — matches
 * the Airbnb/Fiverr/G2G/Eldorado checkout standard (zero distractions at pay).
 * Pure RSC.
 */
export function CheckoutHeader() {
  return (
    <header className="sticky top-0 z-50 border-b border-border bg-[rgba(10,11,13,0.96)] backdrop-blur-[12px]">
      <div className="mx-auto flex h-[58px] w-full max-w-4xl items-center gap-3 px-4">
        <Link
          href="/"
          aria-label="GETX home"
          className="rounded-md focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          <Logo className="h-6" />
        </Link>
        <span className="ml-auto inline-flex items-center gap-1.5 font-heading text-sm font-semibold text-muted-foreground">
          <LockIcon className="size-4 text-success" aria-hidden="true" />
          Secure checkout
        </span>
      </div>
    </header>
  );
}
