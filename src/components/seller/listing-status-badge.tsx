import type { ListingStatus } from "@prisma/client";
import { cn } from "@/lib/utils";

/** v10-toned status chips — green is reserved for live/success states. */
const STATUS_STYLE: Record<ListingStatus, { label: string; className: string }> =
  {
    DRAFT: { label: "Draft", className: "bg-muted text-muted-foreground" },
    ACTIVE: { label: "Live", className: "bg-success/15 text-success" },
    PAUSED: { label: "Paused", className: "bg-warning/15 text-warning" },
    SOLD: { label: "Sold", className: "bg-primary/15 text-primary-hover" },
    REMOVED: {
      label: "Removed",
      className: "bg-destructive/15 text-destructive",
    },
  };

export function ListingStatusBadge({
  status,
  className,
}: {
  status: ListingStatus;
  className?: string;
}) {
  const style = STATUS_STYLE[status];
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full px-2 py-0.5 font-heading text-[11px] font-semibold tracking-wide uppercase",
        style.className,
        className,
      )}
    >
      {style.label}
    </span>
  );
}
