import { cn } from "@/lib/utils";
import { SELLER_LEVELS } from "@/server/services/trust-score";

type Props = {
  level?: string | null;
  className?: string;
  size?: "xs" | "sm" | "md";
};

export function SellerLevelBadge({ level, className, size = "sm" }: Props) {
  const config = SELLER_LEVELS.find((l) => l.id === level) ?? SELLER_LEVELS[0];

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full font-semibold leading-none",
        config.bgColor,
        config.color,
        size === "xs" && "px-1.5 py-0.5 text-[10px]",
        size === "sm" && "px-2 py-1 text-xs",
        size === "md" && "px-3 py-1.5 text-sm",
        className,
      )}
      aria-label={`${config.label} seller`}
    >
      {config.label}
    </span>
  );
}
