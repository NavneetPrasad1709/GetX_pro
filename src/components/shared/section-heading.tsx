import Link from "next/link";
import { ArrowRightIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  kicker?: string;
  title: React.ReactNode;
  description?: React.ReactNode;
  align?: "left" | "center";
  /** Optional "see all" link, right-aligned on desktop (v10 ".link-arrow"). */
  action?: { label: string; href: string };
  className?: string;
};

/** Reusable section header (v10 ".sec-head"): kicker + title + description. */
export function SectionHeading({
  kicker,
  title,
  description,
  align = "left",
  action,
  className,
}: Props) {
  const centered = align === "center";
  return (
    <div
      className={cn(
        "flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between",
        centered && "items-center text-center sm:flex-col sm:items-center",
        className,
      )}
    >
      <div className={cn("flex flex-col", centered && "items-center")}>
        {kicker ? (
          <span className="font-heading text-xs font-semibold tracking-[0.14em] text-primary uppercase">
            {kicker}
          </span>
        ) : null}
        <h2 className="mt-2 text-[clamp(22px,3vw,30px)] font-bold">{title}</h2>
        {description ? (
          <p className="mt-1.5 max-w-prose text-[14.5px] text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>

      {action ? (
        <Link
          href={action.href}
          className="inline-flex shrink-0 items-center gap-1.5 self-start rounded-md font-heading text-sm font-semibold whitespace-nowrap text-muted-foreground transition-colors duration-150 hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none sm:self-auto"
        >
          {action.label}
          <ArrowRightIcon className="size-4" aria-hidden="true" />
        </Link>
      ) : null}
    </div>
  );
}
