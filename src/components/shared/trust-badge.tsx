import {
  LockIcon,
  ShieldCheckIcon,
  RotateCcwIcon,
  ZapIcon,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type TrustVariant = "escrow" | "verified" | "moneyback" | "instant";

const VARIANTS: Record<
  TrustVariant,
  { icon: LucideIcon; label: string; tone: string }
> = {
  escrow: { icon: LockIcon, label: "Escrow-protected", tone: "text-primary" },
  verified: {
    icon: ShieldCheckIcon,
    label: "ID-verified sellers",
    tone: "text-success",
  },
  moneyback: {
    icon: RotateCcwIcon,
    label: "Money-back guarantee",
    tone: "text-primary",
  },
  instant: { icon: ZapIcon, label: "Instant delivery", tone: "text-primary" },
};

type Props = {
  variant: TrustVariant;
  /** override the default label */
  label?: string;
  size?: "sm" | "md";
  className?: string;
};

/** Glass trust pill (v10 ".hbadge") — the core conversion signal everywhere. */
export function TrustBadge({ variant, label, size = "md", className }: Props) {
  const { icon: Icon, label: defaultLabel, tone } = VARIANTS[variant];
  return (
    <span
      className={cn(
        "glass inline-flex items-center gap-2 rounded-full font-heading font-semibold whitespace-nowrap text-foreground transition-[border-color,transform] duration-150 hover:-translate-y-px hover:border-primary/40",
        size === "sm"
          ? "gap-1.5 px-3 py-2 text-xs"
          : "px-3 py-2 text-xs min-[761px]:px-[15px] min-[761px]:py-[9px] min-[761px]:text-[13px]",
        className,
      )}
    >
      <Icon
        className={cn(tone, size === "sm" ? "size-[15px]" : "size-[15px] min-[761px]:size-4")}
        aria-hidden="true"
      />
      {label ?? defaultLabel}
    </span>
  );
}
