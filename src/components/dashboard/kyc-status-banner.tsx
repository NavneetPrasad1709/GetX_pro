import Link from "next/link";
import { AlertTriangleIcon, ClockIcon, XCircleIcon } from "lucide-react";
import type { KycStatus } from "@prisma/client";
import { cn } from "@/lib/utils";

/**
 * Persistent KYC status banner shown across the seller hub (Prompt 06). Surfaces
 * "payouts blocked / under review / rejected" everywhere, not just on the Verify
 * tab. Pure Server Component — status is passed from the dashboard layout's DB
 * read (no re-fetch). Returns null when APPROVED.
 */
export function KycStatusBanner({ kycStatus }: { kycStatus: KycStatus }) {
  if (kycStatus === "APPROVED") return null;

  const config =
    kycStatus === "PENDING"
      ? {
          tone: "border-primary/30 bg-primary/5 text-foreground",
          icon: <ClockIcon className="size-4 shrink-0 text-primary" aria-hidden="true" />,
          text: "Identity under review — payouts unlock once approved (1–2 business days).",
          cta: null,
        }
      : kycStatus === "REJECTED"
        ? {
            tone: "border-destructive/30 bg-destructive/5 text-foreground",
            icon: <XCircleIcon className="size-4 shrink-0 text-destructive" aria-hidden="true" />,
            text: "Your last document was rejected. Re-submit to unlock payouts.",
            cta: "Re-submit →",
          }
        : {
            // NONE
            tone: "border-amber-500/30 bg-amber-500/5 text-foreground",
            icon: <AlertTriangleIcon className="size-4 shrink-0 text-amber-400" aria-hidden="true" />,
            text: "Verify your identity to unlock payouts and earn the ID Verified badge.",
            cta: "Verify now →",
          };

  return (
    <div
      className={cn(
        "mb-5 flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg border p-3 text-sm",
        config.tone,
      )}
    >
      {config.icon}
      <span className="min-w-0 flex-1">{config.text}</span>
      {config.cta ? (
        <Link
          href="/seller/verify"
          className="shrink-0 font-semibold text-primary hover:text-primary-hover"
        >
          {config.cta}
        </Link>
      ) : null}
    </div>
  );
}
