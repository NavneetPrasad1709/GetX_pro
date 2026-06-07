import Link from "next/link";
import {
  UserRoundIcon,
  SwordsIcon,
  CoinsIcon,
  TrendingUpIcon,
  ChevronRightIcon,
  type LucideIcon,
} from "lucide-react";
import { GAME_COPY } from "@/config/games";
import { PageContainer } from "@/components/shared/page-container";
import { SectionHeading } from "@/components/shared/section-heading";

/**
 * Eldorado-style "shop by category" mega-grid (Step 07 UI evolution). One
 * scannable column per listing kind, each linking into the marketplace facet
 * (`/marketplace?type=…`) and listing the launch games beneath it
 * (`?type=…&game=…`). Pure server component — zero client JS, all crawlable
 * links (good for SEO + the "this is a marketplace" first impression).
 */
const KINDS: { type: string; label: string; icon: LucideIcon; blurb: string }[] = [
  { type: "account", label: "Accounts", icon: UserRoundIcon, blurb: "Hand-leveled, full-access" },
  { type: "item", label: "Items & skins", icon: SwordsIcon, blurb: "Rare drops, delivered safely" },
  { type: "currency", label: "Top-ups & currency", icon: CoinsIcon, blurb: "Instant on most orders" },
  { type: "boosting", label: "Boosting", icon: TrendingUpIcon, blurb: "Rank & progress services" },
];

export function CategoryMegaGrid() {
  return (
    <section className="border-t border-border py-10 min-[761px]:py-12 min-[1025px]:py-[62px]">
      <PageContainer>
        <SectionHeading
          kicker="Marketplace"
          title="Shop by category"
          description="Everything gamers buy and sell — escrow-protected, every order."
          className="mb-5 min-[761px]:mb-7"
        />

        <div className="grid grid-cols-1 gap-3.5 min-[521px]:grid-cols-2 min-[941px]:grid-cols-4">
          {KINDS.map(({ type, label, icon: Icon, blurb }) => (
            <div
              key={type}
              className="flex flex-col rounded-lg border border-border bg-card p-4 transition-colors duration-150 hover:border-primary/40 min-[761px]:p-5"
            >
              <Link
                href={`/marketplace?type=${type}`}
                className="group/cat flex items-center gap-3 rounded-sm focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
              >
                <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/12 text-primary">
                  <Icon className="size-[18px]" aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-heading text-[15px] font-bold text-foreground group-hover/cat:text-primary">
                    {label}
                  </span>
                  <span className="block truncate text-[12px] text-faint">
                    {blurb}
                  </span>
                </span>
                <ChevronRightIcon
                  className="size-4 shrink-0 text-faint transition-transform duration-150 group-hover/cat:translate-x-0.5 group-hover/cat:text-primary"
                  aria-hidden="true"
                />
              </Link>

              <ul className="mt-3 flex flex-col gap-0.5 border-t border-border pt-3">
                {GAME_COPY.map((game) => (
                  <li key={game.slug}>
                    <Link
                      href={`/marketplace?type=${type}&game=${game.slug}`}
                      className="block rounded-sm px-1 py-1 text-[13px] text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                    >
                      {game.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </PageContainer>
    </section>
  );
}
