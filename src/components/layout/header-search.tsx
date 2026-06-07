import { SearchIcon, ChevronDownIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { GAME_COPY } from "@/config/games";

/**
 * Hero / drawer search bar (v10 ".searchbar"). Wired in Step 07: a plain GET
 * form that navigates to /marketplace?game=&q=… — zero client JS (server-
 * renderable, so it stays out of the LCP critical path) and works identically
 * on the homepage hero and inside the mobile drawer. The game scoper is a
 * native <select> (OS picker on mobile); options come from the static game
 * config (no DB, no client bundle).
 */
export function HeaderSearch({ className }: { className?: string }) {
  return (
    <form
      role="search"
      method="get"
      action="/marketplace"
      className={cn(
        "flex items-center gap-1.5 rounded-lg border border-input bg-card p-1.5 transition-colors focus-within:border-primary min-[761px]:p-2",
        className,
      )}
    >
      <span className="relative shrink-0">
        <select
          name="game"
          aria-label="Filter by game"
          defaultValue=""
          className="h-full appearance-none rounded-sm bg-secondary py-2.5 pr-9 pl-3 font-heading text-[14.5px] font-semibold text-foreground transition-colors duration-150 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none min-[761px]:bg-transparent min-[761px]:py-[11px] min-[761px]:pr-9 min-[761px]:pl-3.5 min-[761px]:hover:bg-secondary [&>option]:bg-popover [&>option]:text-popover-foreground"
        >
          <option value="">All games</option>
          {GAME_COPY.map((g) => (
            <option key={g.slug} value={g.slug}>
              {g.name}
            </option>
          ))}
        </select>
        <ChevronDownIcon
          className="pointer-events-none absolute top-1/2 right-3 size-[15px] -translate-y-1/2 opacity-55"
          aria-hidden="true"
        />
      </span>
      <span
        className="hidden w-px self-stretch bg-border min-[761px]:my-1 min-[761px]:block"
        aria-hidden="true"
      />
      <input
        type="search"
        name="q"
        placeholder="Search Pokémon GO, accounts, diamonds…"
        aria-label="Search the marketplace"
        className="w-full min-w-0 flex-1 bg-transparent px-1 text-[15px] text-foreground placeholder:text-faint focus-visible:outline-none min-[761px]:px-2"
      />
      <button
        type="submit"
        className="inline-flex shrink-0 items-center justify-center gap-2 rounded-sm bg-primary-strong px-3.5 py-[11px] font-heading text-[14.5px] font-semibold text-primary-foreground transition-colors duration-150 hover:bg-primary-strong-hover focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none min-[761px]:px-[18px]"
      >
        <SearchIcon className="size-[17px]" aria-hidden="true" />
        <span className="sr-only min-[761px]:not-sr-only">Search</span>
      </button>
    </form>
  );
}
