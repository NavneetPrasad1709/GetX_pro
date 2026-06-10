import { BadgeCheckIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = { size?: "sm" | "md"; className?: string };

/**
 * KYC "ID Verified" chip (Prompt 04) — one implementation, used on the seller
 * trust panel and the seller profile header (previously duplicated inline with
 * drifting markup). Pure presentational RSC.
 */
export function VerifiedBadge({ size = "sm", className }: Props) {
  const sm = size === "sm";
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full bg-success/12 font-semibold text-success",
        sm ? "gap-1 px-2 py-0.5 text-[11px]" : "gap-1.5 px-2.5 py-1 text-xs",
        className,
      )}
    >
      <BadgeCheckIcon className={sm ? "size-3.5" : "size-4"} aria-hidden="true" />
      ID Verified
    </span>
  );
}
