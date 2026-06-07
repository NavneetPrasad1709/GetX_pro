import type { OrderStatus } from "@prisma/client";
import { cn } from "@/lib/utils";

/**
 * Order status pill — ONE source for buyer + seller order views. Tones mirror
 * the v10 palette (blue = in-flight/escrow, green = done, amber = needs action,
 * red = dispute, muted = terminal/none).
 */
const STATUS: Record<OrderStatus, { label: string; tone: string }> = {
  DRAFT: { label: "Draft", tone: "bg-muted text-muted-foreground" },
  AWAITING_PAYMENT: {
    label: "Awaiting payment",
    tone: "bg-warning/12 text-warning",
  },
  UNDERPAID: { label: "Underpaid", tone: "bg-warning/12 text-warning" },
  PAID: { label: "Paid · in escrow", tone: "bg-primary/15 text-primary-hover" },
  DELIVERED: { label: "Delivered", tone: "bg-primary/15 text-primary-hover" },
  COMPLETED: { label: "Completed", tone: "bg-success/12 text-success" },
  DISPUTED: { label: "Disputed", tone: "bg-destructive/10 text-destructive" },
  REFUNDED: { label: "Refunded", tone: "bg-muted text-muted-foreground" },
  CANCELLED: { label: "Cancelled", tone: "bg-muted text-muted-foreground" },
  EXPIRED: { label: "Expired", tone: "bg-muted text-muted-foreground" },
};

export function OrderStatusBadge({
  status,
  className,
}: {
  status: OrderStatus;
  className?: string;
}) {
  const { label, tone } = STATUS[status];
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold whitespace-nowrap",
        tone,
        className,
      )}
    >
      {label}
    </span>
  );
}
