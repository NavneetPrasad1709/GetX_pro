import Link from "next/link";
import {
  ArrowRightIcon,
  CoinsIcon,
  Gamepad2Icon,
  RocketIcon,
  SwordsIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatListingCount } from "@/components/marketplace/game-card";
import type { ListingCardData } from "@/components/marketplace/listing-card";

type CategoryKind = ListingCardData["type"];

const KIND_ICON: Record<CategoryKind, React.ComponentType<{ className?: string }>> = {
  ACCOUNT: Gamepad2Icon,
  ITEM: SwordsIcon,
  CURRENCY: CoinsIcon,
  BOOSTING: RocketIcon,
};

type Props = {
  name: string;
  kind: CategoryKind;
  listingCount: number;
  href: string;
  className?: string;
};

/** Category tile on the game landing page (icon + name + live count). */
export function CategoryCard({
  name,
  kind,
  listingCount,
  href,
  className,
}: Props) {
  const Icon = KIND_ICON[kind];

  return (
    <Link
      href={href}
      className={cn(
        "group/cat flex items-center gap-3 rounded-lg border border-border bg-card p-3.5 transition-all duration-150 hover:-translate-y-px hover:border-primary/40 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none min-[761px]:p-4",
        className,
      )}
    >
      <span className="grid size-10 shrink-0 place-items-center rounded-md bg-primary/12 text-primary">
        <Icon className="size-5" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-heading text-[14px] font-semibold text-foreground">
          {name}
        </span>
        <span className="block text-[12px] text-faint">
          {formatListingCount(listingCount)}
        </span>
      </span>
      <ArrowRightIcon
        className="size-4 shrink-0 text-faint transition-all duration-150 group-hover/cat:translate-x-0.5 group-hover/cat:text-primary"
        aria-hidden="true"
      />
    </Link>
  );
}
