import { StarIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  /** 0–5 */
  value: number;
  /** review count, shown as "(123)" when provided */
  count?: number;
  size?: "sm" | "md";
  showValue?: boolean;
  className?: string;
};

/** Star rating with partial fill. Announced as a single label to AT. */
export function Rating({
  value,
  count,
  size = "sm",
  showValue = true,
  className,
}: Props) {
  const v = Math.max(0, Math.min(5, value));
  const pct = (v / 5) * 100;
  const star = size === "sm" ? "size-3.5" : "size-4";
  const label = `Rated ${v.toFixed(1)} out of 5${
    count != null ? ` from ${count} reviews` : ""
  }`;

  return (
    <span
      className={cn("inline-flex items-center gap-1.5", className)}
      role="img"
      aria-label={label}
    >
      <span className="relative inline-flex">
        <span className="inline-flex text-muted-foreground/30">
          {Array.from({ length: 5 }).map((_, i) => (
            <StarIcon key={i} className={cn(star, "fill-current")} />
          ))}
        </span>
        <span
          className="absolute inset-0 inline-flex overflow-hidden text-star"
          style={{ width: `${pct}%` }}
          aria-hidden="true"
        >
          {Array.from({ length: 5 }).map((_, i) => (
            <StarIcon key={i} className={cn(star, "shrink-0 fill-current")} />
          ))}
        </span>
      </span>
      {showValue ? (
        <span className="text-xs font-semibold tabular-nums text-foreground">
          {v.toFixed(1)}
        </span>
      ) : null}
      {count != null ? (
        <span className="text-xs text-muted-foreground">({count})</span>
      ) : null}
    </span>
  );
}
