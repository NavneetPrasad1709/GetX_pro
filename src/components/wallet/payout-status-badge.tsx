import type { PayoutStatus } from "@prisma/client";
import { cn } from "@/lib/utils";

const STATUS: Record<PayoutStatus, { label: string; tone: string }> = {
  REQUESTED: { label: "Requested", tone: "bg-warning/12 text-warning" },
  PROCESSING: { label: "Processing", tone: "bg-primary/15 text-primary-hover" },
  PAID: { label: "Paid", tone: "bg-success/12 text-success" },
  FAILED: { label: "Failed", tone: "bg-destructive/10 text-destructive" },
};

export function PayoutStatusBadge({
  status,
  className,
}: {
  status: PayoutStatus;
  className?: string;
}) {
  const { label, tone } = STATUS[status];
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap",
        tone,
        className,
      )}
    >
      {label}
    </span>
  );
}
