import {
  ShieldIcon,
  ShieldCheckIcon,
  RotateCcwIcon,
  ZapIcon,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

const ITEMS: {
  icon: LucideIcon;
  tone?: "success";
  label: React.ReactNode;
}[] = [
  {
    icon: ShieldIcon,
    label: (
      <>
        <b className="font-semibold text-foreground">100%</b> Buyer Protection
      </>
    ),
  },
  { icon: ShieldCheckIcon, tone: "success", label: "Verified sellers" },
  { icon: RotateCcwIcon, label: "Money-back guarantee" },
  { icon: ZapIcon, label: "Instant delivery" },
];

/**
 * Slim trust strip above the header (v10 ".trustribbon") — desktop only;
 * phones/tablets get the same signals in the hero badges instead.
 */
export function TrustRibbon() {
  return (
    <div className="hidden border-b border-border bg-bg-2 min-[901px]:block">
      <div className="mx-auto flex h-10 w-full max-w-[1120px] items-center justify-center gap-[30px] overflow-x-auto px-[22px] no-scrollbar">
        {ITEMS.map(({ icon: Icon, tone, label }, i) => (
          <span
            key={i}
            className="inline-flex items-center gap-2 font-heading text-[13px] font-medium whitespace-nowrap text-muted-foreground"
          >
            <Icon
              className={cn(
                "size-4",
                tone === "success" ? "text-success" : "text-primary",
              )}
              aria-hidden="true"
            />
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}
