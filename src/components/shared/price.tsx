import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";

type Props = {
  /** integer minor units (paisa/cents) — never a float */
  amountMinor: number;
  currency?: string;
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
};

const SIZES = {
  sm: "text-sm",
  md: "text-base",
  lg: "text-xl",
  xl: "text-2xl",
} as const;

/** Renders a money amount from minor units (e.g. 49900 → $499.00). */
export function Price({ amountMinor, currency = "USD", size = "md", className }: Props) {
  return (
    <span
      className={cn(
        "font-heading font-semibold tabular-nums text-foreground",
        SIZES[size],
        className,
      )}
    >
      {formatMoney(amountMinor, currency)}
    </span>
  );
}
