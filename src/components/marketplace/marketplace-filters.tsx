"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import dynamic from "next/dynamic";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { SearchIcon, SlidersHorizontalIcon, Loader2Icon } from "lucide-react";
import { cn } from "@/lib/utils";
import { minorToMajorString } from "@/lib/money";
import {
  SORT_OPTIONS,
  hasActiveFilters,
  type MarketplaceFilters,
} from "@/lib/validators/marketplace";
import type { FacetCounts } from "@/server/services/marketplace";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import {
  FilterControls,
  type GameOption,
} from "@/components/marketplace/filter-controls";

// Lazy-load the mobile bottom sheet so it stays out of the marketplace LCP path.
const FilterSheet = dynamic(
  () => import("@/components/marketplace/filter-sheet").then((m) => m.FilterSheet),
  { ssr: false },
);

type Props = {
  filters: MarketplaceFilters;
  games: GameOption[];
  facets: FacetCounts;
};

const SEARCH_DEBOUNCE_MS = 350;

/** Count of active filters (excludes search + sort) — drives the mobile badge. */
function activeFilterCount(f: MarketplaceFilters): number {
  let n = 0;
  if (f.game) n++;
  if (f.type) n++;
  if (f.delivery) n++;
  if (f.minPriceMinor !== undefined || f.maxPriceMinor !== undefined) n++;
  if (f.trust !== undefined) n++;
  if (f.rating !== undefined) n++;
  if (f.minSales !== undefined) n++;
  if (f.verified) n++;
  if (f.currency) n++;
  return n;
}

/**
 * Interactive marketplace filter bar (the ONLY client island on the page).
 * Every control writes to the URL query so results stay shareable + SEO-ok;
 * the server re-renders the grid from those params. Search is debounced;
 * selects + price apply on change. Native <select> = zero extra JS + OS picker
 * on mobile. The actual listing grid is rendered server-side (see results).
 */
export function MarketplaceFilters({ filters, games, facets }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  // URL-derived display values for the free-text inputs.
  const urlQ = filters.q ?? "";
  const urlMin =
    filters.minPriceMinor !== undefined
      ? minorToMajorString(filters.minPriceMinor, "INR")
      : "";
  const urlMax =
    filters.maxPriceMinor !== undefined
      ? minorToMajorString(filters.maxPriceMinor, "INR")
      : "";

  // Local state only for the debounced text inputs; selects read the URL.
  const [q, setQ] = useState(urlQ);
  const [minPrice, setMinPrice] = useState(urlMin);
  const [maxPrice, setMaxPrice] = useState(urlMax);
  const [sheetOpen, setSheetOpen] = useState(false);

  // Adopt URL-derived values when they change from OUTSIDE this bar (a removed
  // chip, "clear all", "reset all"). setState DURING RENDER is React's
  // recommended way to reset state on a prop change — no effect, no extra paint.
  // Our own pushes converge to the same values, so this is a no-op for them
  // (and never clobbers an in-progress edit, since pushParams sends all three).
  const [urlSnapshot, setUrlSnapshot] = useState({
    q: urlQ,
    min: urlMin,
    max: urlMax,
  });
  if (
    urlSnapshot.q !== urlQ ||
    urlSnapshot.min !== urlMin ||
    urlSnapshot.max !== urlMax
  ) {
    setUrlSnapshot({ q: urlQ, min: urlMin, max: urlMax });
    setQ(urlQ);
    setMinPrice(urlMin);
    setMaxPrice(urlMax);
  }

  // Always read the LATEST URL params, even from a stale debounce-timer
  // closure: otherwise a select change made within the debounce window could be
  // overwritten by a timer that captured the pre-change params. (Synced in an
  // effect — writing a ref during render is disallowed.)
  const spRef = useRef(searchParams);
  useEffect(() => {
    spRef.current = searchParams;
  }, [searchParams]);

  // Build the next URL: selects come from the live URL, free-text from local
  // state (so a select change never drops an in-progress search), then any
  // explicit override is applied. Every change resets to page 1.
  // Stable reference (useCallback) so the lazy sheet doesn't see prop churn.
  const pushParams = useCallback(
    (overrides: Record<string, string | undefined>) => {
      const currentQs = spRef.current.toString();
      const params = new URLSearchParams(currentQs);
      const setOrDelete = (key: string, value: string | undefined) => {
        const v = value?.trim();
        if (v) params.set(key, v);
        else params.delete(key);
      };

      setOrDelete("q", q);
      setOrDelete("min", minPrice);
      setOrDelete("max", maxPrice);
      for (const [key, value] of Object.entries(overrides)) {
        setOrDelete(key, value);
      }
      params.delete("page");

      const qs = params.toString();
      if (qs === currentQs) return; // nothing actually changed
      startTransition(() => {
        router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
      });
    },
    [q, minPrice, maxPrice, pathname, router],
  );

  // Debounce free-text (search + price). Skip the very first run so we don't
  // re-navigate to the URL the page already loaded with.
  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    const t = setTimeout(() => pushParams({}), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
    // pushParams reads live state; we only want to fire on text changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, minPrice, maxPrice]);

  const count = activeFilterCount(filters);
  const showReset = hasActiveFilters(filters) || filters.sort !== "newest";

  return (
    <div className="flex flex-col gap-3" aria-busy={isPending || undefined}>
      {/* search + sort + (mobile) filter toggle */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <SearchIcon
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search listings…"
            aria-label="Search listings"
            className="h-10 pl-9"
          />
        </div>

        <div className="hidden items-center gap-2 min-[761px]:flex">
          <Label htmlFor="mp-sort" className="sr-only">
            Sort by
          </Label>
          <NativeSelect
            id="mp-sort"
            value={filters.sort}
            onChange={(e) => pushParams({ sort: e.target.value })}
            className="h-10 w-44"
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </NativeSelect>
        </div>

        <button
          type="button"
          onClick={() => setSheetOpen(true)}
          aria-haspopup="dialog"
          className="inline-flex h-10 shrink-0 items-center gap-2 rounded-lg border border-input bg-card px-3 font-heading text-sm font-semibold transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none min-[761px]:hidden"
        >
          {isPending ? (
            <Loader2Icon className="size-4 animate-spin" aria-hidden="true" />
          ) : (
            <SlidersHorizontalIcon className="size-4" aria-hidden="true" />
          )}
          Filters
          {count > 0 ? (
            <span className="grid size-5 place-items-center rounded-full bg-primary-strong text-[11px] font-bold text-primary-foreground">
              {count}
            </span>
          ) : null}
        </button>
      </div>

      {/* quick-toggle: ⚡ Instant only — always visible, no panel needed */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          role="switch"
          aria-checked={filters.delivery === "INSTANT"}
          onClick={() =>
            pushParams({
              delivery: filters.delivery === "INSTANT" ? undefined : "instant",
            })
          }
          className={cn(
            "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
            filters.delivery === "INSTANT"
              ? "border-primary bg-primary/10 text-primary"
              : "border-input bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground",
          )}
        >
          <span aria-hidden="true">⚡</span>
          Instant only
        </button>
      </div>

      {/* DESKTOP inline panel (≥761px). Mobile uses the bottom sheet below. */}
      <div className="hidden grid-cols-4 items-end gap-3 rounded-lg border border-border bg-card/40 p-3 min-[761px]:grid min-[1024px]:grid-cols-6">
        <FilterControls
          filters={filters}
          games={games}
          facets={facets}
          pushParams={pushParams}
          minPrice={minPrice}
          maxPrice={maxPrice}
          onMinChange={setMinPrice}
          onMaxChange={setMaxPrice}
          idPrefix="mp-d"
        />
        {showReset ? (
          <div className="flex items-end">
            <a
              href="/marketplace"
              className="inline-flex h-8 items-center rounded-sm px-2 text-sm font-semibold text-primary transition-colors hover:text-primary-hover focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
            >
              Reset all
            </a>
          </div>
        ) : null}
      </div>

      {/* MOBILE bottom sheet (≤760px) — lazy-loaded, only mounted when opened. */}
      {sheetOpen ? (
        <FilterSheet
          open={sheetOpen}
          onOpenChange={setSheetOpen}
          filters={filters}
          games={games}
          facets={facets}
          pushParams={pushParams}
          activeCount={count}
          minPrice={minPrice}
          maxPrice={maxPrice}
          onMinChange={setMinPrice}
          onMaxChange={setMaxPrice}
        />
      ) : null}
    </div>
  );
}
